import { businesses, emptyBusinessDetails, type Business, type BusinessDetails } from "./businesses";
import { blankClient, type Client } from "./clients";
import { readContactList, validateContacts } from "./client-contacts";

export type CatalogBusiness = { id: Business["id"]; details: BusinessDetails; updatedAt: string };
export type Catalog = { clients: Client[]; businesses: CatalogBusiness[] };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type LocalSnapshot = { version: 1; exportedAt: string; clients: Client[]; businesses: { id: Business["id"]; details: BusinessDetails }[] };
export type ImportReport = { clients: number; businesses: number; links: number };
export class CatalogError extends Error {}

const columns: Record<string, string> = { legalName: "legal_name", personType: "person_type", postalCode: "postal_code", legacyName: "legacy_name", orderTemplate: "order_template" };
export function toDatabase(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "clients" && key !== "updatedAt").map(([key, field]) => [columns[key] ?? key, field]));
}
export function clientFromDatabase(row: Record<string, unknown>): Client {
  const result = blankClient();
  for (const key of Object.keys(result) as (keyof Client)[]) {
    if (key === "active") result.active = row.active === true;
    else if (key === "contacts") result.contacts = readContactList(row.contacts, row);
    else if (key === "personType") result.personType = row.person_type as Client["personType"];
    else result[key] = String(row[columns[key] ?? key] ?? "");
  }
  result.updatedAt = String(row.updated_at);
  return result;
}
export function businessFromDatabase(row: Record<string, unknown>, clients: string[]): CatalogBusiness {
  const details = emptyBusinessDetails();
  for (const key of Object.keys(details) as (keyof BusinessDetails)[]) {
    if (key !== "clients") details[key] = String(row[columns[key] ?? key] ?? "");
  }
  details.clients = clients;
  return { id: businessId(row.id), details, updatedAt: String(row.updated_at) };
}
export function businessId(value: unknown): Business["id"] {
  const business = businesses.find(b => b.id === value);
  if (!business) throw new CatalogError("Razón social no válida.");
  return business.id;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CatalogError("Datos no válidos.");
  return value as Record<string, unknown>;
}
export function validateClient(value: unknown): Client {
  const source = record(value);
  const client = blankClient();
  for (const key of Object.keys(client) as (keyof Client)[]) {
    if (key === "contacts") {
      try { client.contacts = validateContacts(source.contacts, source); }
      catch(error) { throw new CatalogError(error instanceof Error ? error.message : "Contactos no válidos."); }
    } else if (key === "active") {
      if (typeof source.active !== "boolean") throw new CatalogError("Estado del cliente no válido.");
      client.active = source.active;
    } else {
      const field = source[key];
      if (typeof field !== "string" || field.length > (key === "notes" ? 2000 : 500)) throw new CatalogError(`Campo no válido: ${key}.`);
      if (key === "personType") {
        if (!["", "fisica", "moral"].includes(field)) throw new CatalogError("Tipo de persona no válido.");
        client.personType = field as Client["personType"];
      } else client[key] = field;
    }
  }
  client.name = client.name.trim();
  if (!client.name) throw new CatalogError("Escribe el nombre del cliente.");
  // Legacy columns mirror the first contact for existing consumers and snapshots.
  client.contact = client.contacts[0]?.name ?? "";
  client.email = client.contacts[0]?.email ?? "";
  client.phone = client.contacts[0]?.phone ?? "";
  validateContact(client);
  return client;
}
function validateContact(value: { email: string; rfc: string }) {
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) throw new CatalogError("Correo electrónico no válido.");
  if (value.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(value.rfc.trim())) throw new CatalogError("El RFC debe tener un formato válido.");
}
export function validateBusiness(value: unknown): BusinessDetails {
  const source = record(value);
  const result = emptyBusinessDetails();
  for (const key of Object.keys(result) as (keyof BusinessDetails)[]) {
    if (key === "clients") continue;
    const field = source[key];
    if (typeof field !== "string" || field.length > (key === "notes" ? 2000 : 500)) throw new CatalogError(`Campo no válido: ${key}.`);
    result[key] = field;
  }
  if (!["", "fisica", "moral"].includes(result.personType)) throw new CatalogError("Tipo de persona no válido.");
  validateContact(result);
  return result;
}
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
