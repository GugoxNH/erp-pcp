"use server";
import { requireAccess } from "../lib/access-server";
import { validateProduct, type Product, type ProductClientOption } from "../lib/products";
import type { ActionResult } from "../lib/catalog-model";

async function database() {
  return (await requireAccess("products")).db;
}
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar la operación." }; }
}
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.message?.includes("INVALID_SUPPLIER")) throw new Error("Un proveedor ya no está disponible. Actualiza el catálogo y revisa sus asociaciones.");
  if (error.message?.includes("PRODUCT_STALE")) throw new Error("El producto cambió en otra sesión. Actualiza el catálogo.");
  if (error.code === "23505") throw new Error("El código interno o un código de ese cliente ya está asignado a un producto.");
  if (error.code === "23503") throw new Error("El producto tiene movimientos asociados. Desactívalo en lugar de eliminarlo.");
  throw new Error("No se pudo guardar o consultar en Supabase. Intenta nuevamente.");
}
export async function listProducts(): Promise<ActionResult<Product[]>> {
  return run(async () => {
    const db = await database(); const rows: Product[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("products").select("*,client_codes:product_client_codes(client_id,code),product_suppliers(supplier_id,code)").order("sku").order("id").range(offset, offset + 999);
      check(error); rows.push(...(data ?? []).map(({product_suppliers,...row}) => ({...row,supplier_ids:product_suppliers.map((s: {supplier_id:string;code:string})=>s.supplier_id),supplier_codes:Object.fromEntries(product_suppliers.map((s: {supplier_id:string;code:string})=>[s.supplier_id,s.code]))})) as Product[]);
      if (!data || data.length < 1000) return rows;
    }
  });
}
export async function saveProduct(product: Product): Promise<ActionResult<Product>> {
  return run(async () => {
    const db = await database(); const values = validateProduct(product);
    if (product.id && !product.updated_at) throw new Error("Actualiza el catálogo antes de guardar.");
    const { data, error } = await db.rpc("save_product_catalog", { payload: values, product_id: product.id || null, expected_version: product.updated_at || null }); check(error);
    if (!data) throw new Error("El producto cambió en otra sesión. Cierra el formulario y actualiza el catálogo.");
    return data as Product;
  });
}
export async function listProductClients(): Promise<ActionResult<ProductClientOption[]>> {
  return run(async () => {
    const db = await database(); const rows: ProductClientOption[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data,error } = await db.rpc("product_client_options").range(offset,offset+999);
      check(error); rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  });
}
export async function deleteProduct(id: string, version: string): Promise<ActionResult<null>> {
  return run(async () => {
    const db = await database();
    if (!id || !version) throw new Error("Actualiza el catálogo antes de eliminar.");
    const { data, error } = await db.from("products").delete().eq("id", id).eq("updated_at", version).select("id").maybeSingle();
    check(error); if (!data) throw new Error("El producto cambió o ya fue eliminado. Actualiza el catálogo.");
    return null;
  });
}
