"use server";

import { normalizeClientName, type Client } from "../lib/clients";
import { type BusinessDetails } from "../lib/businesses";
import { businessFromDatabase, businessId, CatalogError, clientFromDatabase, record, toDatabase, validateBusiness, validateClient, type ActionResult, type Catalog, type ImportReport } from "../lib/catalog-model";
import { companies } from "../lib/extract-order";
import { requireAccess } from "../lib/access-server";
import { canAccess, type Section } from "../lib/access";

async function administrator(section?: Section) {
  return (await requireAccess(section)).db;
}
function dbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new CatalogError("Ya existe un cliente con ese nombre o identificador.");
  if (error.code === "23503") throw new CatalogError("El registro tiene asociaciones o cambió. Actualiza el catálogo antes de continuar.");
  if (error.message?.includes("CLIENT_CONTACTS_INVALID")) throw new CatalogError("Revisa los datos de los contactos del cliente.");
  if (error.code === "PGRST202") throw new CatalogError("Falta ejecutar la migración 202610070002_import_catalogs.sql en Supabase.");
  if (error.message?.includes("IMPORT_CLIENT_CONFLICT")) throw new CatalogError("Hay un cliente distinto en Supabase con el mismo identificador. No se importó ningún dato.");
  if (error.message?.includes("IMPORT_BUSINESS_CONFLICT")) throw new CatalogError("Una razón social ya tiene datos distintos en Supabase. No se importó ningún dato.");
  throw new CatalogError("No se pudo completar la operación en Supabase. Revisa tu conexión y vuelve a intentarlo.");
}
async function result<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error: error instanceof CatalogError ? error.message : "No se pudo conectar con Supabase. Intenta nuevamente." }; }
}
async function rows(db: Awaited<ReturnType<typeof administrator>>, table: "clients" | "business_clients") {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from(table).select("*").order(table === "clients" ? "id" : "business_id");
    if (table === "business_clients") query = query.order("client_id");
    const { data, error } = await query.range(offset, offset + 999);
    dbError(error);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}
export async function getCatalog(): Promise<ActionResult<Catalog>> {
  return result(async () => {
    const {db,profile} = await requireAccess();
    if (!["businesses","clients","orders"].some(s => canAccess(profile,s as Section))) return { clients: [], businesses: [] };
    const clients = await rows(db, "clients");
    const links = await rows(db, "business_clients");
    const { data: businesses, error } = await db.from("businesses").select("*").order("id");
    dbError(error);
    return { clients: clients.map(clientFromDatabase), businesses: (businesses ?? []).map(row => businessFromDatabase(row, links.filter(link => link.business_id === row.id).map(link => String(link.client_id)))) };
  });
}
export async function saveClient(draft: Client, original: Client | null): Promise<ActionResult<Client>> {
  return result(async () => {
    const db = await administrator("clients");
    const client = validateClient(draft);
    const existing = await rows(db, "clients");
    if (existing.some(row => row.id !== original?.id && normalizeClientName(String(row.name)) === normalizeClientName(client.name))) throw new CatalogError("Ya existe un cliente con ese nombre. Usa un nombre distinto para cada planta.");
    client.rfc = client.rfc.trim().toUpperCase(); client.email = client.email.trim();
    if (original) {
      const current = existing.find(row => row.id === original.id);
      if (!current || current.updated_at !== original.updatedAt) throw new CatalogError("El cliente cambió en otra sesión. Cierra el formulario y vuelve a abrirlo.");
      client.id = String(current.id); client.legacyName = String(current.legacy_name); client.orderTemplate = String(current.order_template);
      const { data, error } = await db.from("clients").update(toDatabase(client)).eq("id", client.id).eq("updated_at", original.updatedAt!).select().maybeSingle();
      dbError(error);
      if (!data) throw new CatalogError("El cliente cambió mientras guardabas. Recarga el catálogo.");
      return clientFromDatabase(data);
    }
    client.id = crypto.randomUUID(); client.legacyName = ""; client.orderTemplate = "";
    const { data, error } = await db.from("clients").insert(toDatabase(client)).select().single();
    dbError(error);
    return clientFromDatabase(data!);
  });
}
export async function deleteClient(client: Client): Promise<ActionResult<null>> {
  return result(async () => {
    const db = await administrator("clients");
    if (!client.id || !client.updatedAt) throw new CatalogError("Actualiza el catálogo antes de eliminar.");
    const { data, error } = await db.from("clients").delete().eq("id", client.id).eq("updated_at", client.updatedAt).select("id").maybeSingle();
    dbError(error);
    if (!data) throw new CatalogError("El cliente cambió o ya fue eliminado. Actualiza el catálogo.");
    return null;
  });
}
export async function saveBusiness(id: string, details: BusinessDetails, updatedAt: string): Promise<ActionResult<null>> {
  return result(async () => {
    const db = await administrator("businesses");
    const values = validateBusiness(details);
    values.rfc = values.rfc.trim().toUpperCase(); values.email = values.email.trim();
    if (!updatedAt) throw new CatalogError("Recarga los datos de la razón social.");
    const { data, error } = await db.from("businesses").update(toDatabase(values)).eq("id", businessId(id)).eq("updated_at", updatedAt).select("id").maybeSingle();
    dbError(error);
    if (!data) throw new CatalogError("La razón social cambió en otra sesión. Recarga antes de guardar.");
    return null;
  });
}
export async function setAssociation(id: string, clientId: string, assigned: boolean): Promise<ActionResult<null>> {
  return result(async () => {
    const db = await administrator("businesses");
    businessId(id);
    if (typeof clientId !== "string" || !clientId || typeof assigned !== "boolean") throw new CatalogError("Asociación no válida.");
    const { error } = assigned
      ? await db.from("business_clients").upsert({ business_id: id, client_id: clientId }, { onConflict: "business_id,client_id", ignoreDuplicates: true })
      : await db.from("business_clients").delete().eq("business_id", id).eq("client_id", clientId);
    dbError(error);
    return null;
  });
}
export async function importCatalog(snapshot: unknown): Promise<ActionResult<ImportReport>> {
  return result(async () => {
    await requireAccess("clients");
    const db = await administrator("businesses");
    const source = record(snapshot);
    if (source.version !== 1 || !Array.isArray(source.clients) || source.clients.length > 1000 || !Array.isArray(source.businesses) || source.businesses.length > 3) throw new CatalogError("Respaldo no válido o demasiado grande.");
    const clients = source.clients.map(validateClient);
    const ids = new Set(clients.map(client => client.id));
    const names = new Set(clients.map(client => normalizeClientName(client.name)));
    if (ids.size !== clients.length || ids.has("") || names.size !== clients.length) throw new CatalogError("El respaldo contiene clientes duplicados o sin identificador.");
    if (clients.some(client => client.orderTemplate && !companies.some(name => name === client.orderTemplate))) throw new CatalogError("El respaldo contiene un formato de lectura desconocido.");
    const links: { business_id: string; client_id: string }[] = [];
    const seen = new Set<string>();
    const businessRows = source.businesses.map(value => {
      const entry = record(value);
      const id = businessId(entry.id);
      if (seen.has(id)) throw new CatalogError("Razón social repetida en el respaldo.");
      seen.add(id);
      const details = validateBusiness(entry.details);
      const assignments = record(entry.details).clients;
      if (!Array.isArray(assignments) || assignments.length > 1000) throw new CatalogError("Asociaciones no válidas.");
      for (const assignment of assignments) {
        const matches = clients.filter(client => client.id === assignment || (client.legacyName && client.legacyName === assignment));
        if (matches.length !== 1) throw new CatalogError(`No se pudo identificar al cliente asociado: ${String(assignment).slice(0, 100)}.`);
        links.push({ business_id: id, client_id: matches[0].id });
      }
      return { id, ...toDatabase(details) };
    });
    const { data, error } = await db.rpc("import_local_catalogs", { payload: { clients: clients.map(toDatabase), businesses: businessRows, links } });
    dbError(error);
    return data as ImportReport;
  });
}
