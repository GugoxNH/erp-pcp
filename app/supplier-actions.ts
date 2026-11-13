"use server";
import {requireAccess} from "../lib/access-server";
import {validateSupplier,type Supplier,type SupplierOption} from "../lib/suppliers";
import type {ActionResult} from "../lib/catalog-model";
async function run<T>(fn:()=>Promise<T>):Promise<ActionResult<T>> {
  try{return {ok:true,value:await fn()};}catch(e){return {ok:false,error:e instanceof Error?e.message:"No se pudo completar la operación."};}
}
function check(error:{code?:string}|null) {
  if(!error)return;
  if(error.code==="23503")throw new Error("El proveedor está asociado a productos o compras. Puedes desactivarlo para conservar su historial.");
  if(error.code==="23505")throw new Error("Ya existe un proveedor con ese RFC.");
  throw new Error("No se pudo consultar o guardar proveedores. Verifica que la migración de Supabase esté aplicada.");
}
export async function listSuppliers():Promise<ActionResult<Supplier[]>> {return run(async()=>{
  const {db}=await requireAccess("suppliers"); const rows:Supplier[]=[];
  for(let offset=0;;offset+=1000){const {data,error}=await db.from("suppliers").select("*").order("name").order("id").range(offset,offset+999);check(error);rows.push(...data??[]);if(!data||data.length<1000)return rows;}
});}
export async function saveSupplier(supplier:Supplier):Promise<ActionResult<Supplier>> {return run(async()=>{
  const {db}=await requireAccess("suppliers");const values=validateSupplier(supplier);
  if(supplier.id&&!supplier.updated_at)throw new Error("Actualiza el catálogo antes de guardar.");
  const query=supplier.id?db.from("suppliers").update(values).eq("id",supplier.id).eq("updated_at",supplier.updated_at):db.from("suppliers").insert(values);
  const {data,error}=await query.select().maybeSingle();check(error);
  if(!data)throw new Error("El proveedor cambió en otra sesión. Actualiza el catálogo.");return data as Supplier;
});}
export async function deleteSupplier(id:string,version:string):Promise<ActionResult<null>> {return run(async()=>{
  const {db}=await requireAccess("suppliers");if(!id||!version)throw new Error("Actualiza el catálogo.");
  const {data,error}=await db.from("suppliers").delete().eq("id",id).eq("updated_at",version).select("id").maybeSingle();check(error);
  if(!data)throw new Error("El proveedor cambió o ya fue eliminado. Actualiza el catálogo.");return null;
});}
export async function listProductSuppliers():Promise<ActionResult<SupplierOption[]>> {return run(async()=>{
  const {db}=await requireAccess("products");const rows:SupplierOption[]=[];
  for(let offset=0;;offset+=1000){const {data,error}=await db.rpc("product_supplier_options").range(offset,offset+999);check(error);rows.push(...data??[]);if(!data||data.length<1000)return rows;}
});}
