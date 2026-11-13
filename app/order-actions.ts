"use server";
import { requireAccess } from "../lib/access-server";
import {canAccess,hasPermission} from "../lib/access";
import type {OrderProduct} from "../lib/order-products";
import { businessId, CatalogError, type ActionResult } from "../lib/catalog-model";
import { validateOrder, type SavedOrder, type OrderSummary, type OrderEvent } from "../lib/purchase-orders";

async function administrator() {
  return (await requireAccess("orders")).db;
}
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if(error.message?.includes("ORDER_EDIT_FORBIDDEN"))throw new CatalogError("No tienes el permiso Editar ordenes de compras.");
  if(error.message?.includes("ORDER_SHIPMENT_MANAGED"))throw new CatalogError("El envío de esta partida se calcula desde las salidas del almacén y no se puede editar manualmente.");
  if(error.message?.includes("ORDER_SHIPMENT_DATE"))throw new CatalogError("La fecha de la OC no puede ser posterior a sus salidas del almacén.");
  if(error.message?.includes("ORDER_ITEM_ID"))throw new CatalogError("La identidad de una partida no es válida. Recarga la orden antes de guardar.");
  if(error.message?.includes("ORDER_ITEM_LOCKED"))throw new CatalogError("Una partida tiene operaciones asociadas. No puedes eliminarla, cancelar su OC ni cambiar su producto, tipo, código, unidad, cantidad o subpartidas.");
  if(error.code==="23503")throw new CatalogError("La orden o una partida tiene registros asociados y no se puede eliminar.");
  if(error.message?.includes("ORDER_PRODUCT_REQUIRED"))throw new CatalogError("Hay refacciones sin producto activo asociado a su código de cliente. Vuelve a guardar para resolverlas.");
  if(error.message?.includes("ORDER_REQUIRED_FIELDS"))throw new CatalogError("Completa número y fecha de OC, y la fecha de entrega/servicio de cada partida.");
  if (error.message?.includes("ORDER_RELOAD_REQUIRED")) throw new CatalogError("Recarga la pantalla: cambió la estructura de las partidas para conservar su trazabilidad.");
  if (error.code === "23505") throw new CatalogError("Ya existe esa OC para este cliente y razón social.");
  if (error.message?.includes("ORDER_CONFLICT")) throw new CatalogError("La orden cambió en otra sesión o ya se guardó. Vuelve al listado y abre la versión actual.");
  if (error.message?.includes("ORDER_CLIENT_NOT_ASSIGNED")) throw new CatalogError("El cliente debe estar activo y asociado a esta razón social.");
  if (error.message?.includes("ORDER_CANCELLED")) throw new CatalogError("Una orden cancelada no puede modificarse.");
  if (error.message?.includes("ORDER_IDENTITY")) throw new CatalogError("No se puede cambiar el cliente o la razón social de una orden guardada.");
  if (error.message?.includes("ORDER_STATUS")) throw new CatalogError("Una orden registrada no puede volver a borrador.");
  if (error.code === "23514" || error.code === "22003" || error.message?.includes("ORDER_")) throw new CatalogError("Revisa las fechas, partidas e importes de la orden.");
  throw new CatalogError("No se pudo completar la operación en Supabase. Intenta nuevamente.");
}
async function result<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error: error instanceof CatalogError ? error.message : "No se pudo conectar con Supabase. Intenta nuevamente." }; }
}
export async function listOrders(business: string, filters: { search: string; status: string; kind: string; page: number }): Promise<ActionResult<{ orders: OrderSummary[]; count: number }>> {
  return result(async () => {
    const db = await administrator();
    const page = Number.isSafeInteger(filters.page) ? Math.max(0, filters.page) : 0;
    let query = db.from("purchase_orders").select("id,number,kind,status,fulfillment,order_date,commitment_date,currency,total::text,client_snapshot,revision", { count: "exact" }).eq("business_id", businessId(business));
    if (["draft", "confirmed", "cancelled"].includes(filters.status)) query = query.eq("status", filters.status);
    if (["parts", "service"].includes(filters.kind)) query = query.in("kind", [filters.kind, "mixed"]);
    if (filters.kind === "mixed") query = query.eq("kind", "mixed");
    const search = typeof filters.search === "string" ? filters.search.trim().slice(0, 100) : "";
    // Search OC numbers literally; never concatenate user input into a PostgREST OR expression.
    if (search) query = query.ilike("number", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
    check(error);
    return { orders: (data ?? []) as unknown as OrderSummary[], count: count ?? 0 };
  });
}
export async function getOrder(business: string, id: string): Promise<ActionResult<{ order: SavedOrder; events: OrderEvent[] }>> {
  return result(async () => {
    const db = await administrator();
    const { data, error } = await db.from("purchase_orders").select("*,tax::text,subtotal::text,total::text,purchase_order_items(id,shipped_quantity::text,operations_locked_at,subitems,kind,position,code,description,unit,quantity::text,unit_price::text,discount::text,commitment_date,fulfillment,completed_date)").eq("business_id", businessId(business)).eq("id", id).single();
    check(error);
    const { data: events, error: historyError } = await db.from("purchase_order_events").select("*").eq("order_id", id).order("revision", { ascending: false }).limit(51);
    check(historyError);
    const items = (data.purchase_order_items as Record<string, unknown>[]).sort((a, b) => Number(a.position) - Number(b.position)).map(item => ({ id: String(item.id), shipped_quantity: String(item.shipped_quantity ?? "0"), operations_locked_at: item.operations_locked_at == null ? null : String(item.operations_locked_at), subitems: item.subitems ?? [], kind: String(item.kind), code: String(item.code), description: String(item.description), unit: String(item.unit), quantity: String(item.quantity), unit_price: String(item.unit_price), discount: String(item.discount), commitment_date: String(item.commitment_date ?? ""), fulfillment: String(item.fulfillment), completed_date: String(item.completed_date ?? "") }));
    return { order: { ...data, items, tax: String(data.tax), commitment_date: data.commitment_date ?? "", completed_date: data.completed_date ?? "" } as SavedOrder, events: (events ?? []) as OrderEvent[] };
  });
}
export async function saveOrder(value: unknown): Promise<ActionResult<string>> {
  return result(async () => {
    const {db,profile} = await requireAccess("orders");
    const draft = validateOrder(value);
    if(draft.revision > 0 && !hasPermission(profile,"edit_orders"))throw new CatalogError("No tienes el permiso Editar ordenes de compras.");
    const { data, error } = await db.rpc("save_purchase_order", { payload: {...draft,status:draft.revision===0?"confirmed":draft.status,item_delivery_version:4} });
    check(error);
    return String(data);
  });
}

export async function orderProductOptions(business:string,client:string):Promise<ActionResult<{products:OrderProduct[];canManage:boolean}>> {
  return result(async()=>{
    const {db,profile}=await requireAccess("orders");
    const products:OrderProduct[]=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await db.rpc("order_product_options",{business:businessId(business),customer:client}).range(offset,offset+999);
      check(error);products.push(...(data??[]) as OrderProduct[]);
      if(!data||data.length<1000)break;
    }
    return {products,canManage:canAccess(profile,"products")};
  });
}

export async function resolveOrderProduct(business:string,client:string,code:string,productId:string|null,newProduct:{sku:string;name:string;unit:string}|null):Promise<ActionResult<void>> {
  return result(async()=>{
    const {db}=await requireAccess("orders");
    await requireAccess("products");
    if(!code.trim()||code.trim().length>80)throw new CatalogError("Código de cliente no válido.");
    const {error}=await db.rpc("resolve_order_product",{business:businessId(business),customer:client,customer_code:code,target:productId,new_product:newProduct});
    if(error?.code==="23505")throw new CatalogError("El código interno o el código del cliente ya está registrado. Actualiza la selección.");
    check(error);
  });
}

export async function deleteOrder(business:string,id:string,revision:number,confirmation:string):Promise<ActionResult<void>> {
  return result(async()=>{
    const db=await administrator();
    if(confirmation!=="ELIMINAR" || !Number.isSafeInteger(revision) || revision<1) throw new CatalogError("Escribe ELIMINAR para confirmar.");
    const {error}=await db.rpc("delete_purchase_order",{target:id,business:businessId(business),expected:revision,confirmation});
    check(error);
  });
}
