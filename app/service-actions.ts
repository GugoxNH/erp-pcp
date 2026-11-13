"use server";
import {requireAccess} from "../lib/access-server";
import {businessId,CatalogError,type ActionResult} from "../lib/catalog-model";
import type {ServiceList} from "../lib/services";

async function run<T>(operation:()=>Promise<T>):Promise<ActionResult<T>> {
  try {return {ok:true,value:await operation()};}
  catch(error) {return {ok:false,error:error instanceof CatalogError?error.message:"No se pudo completar la operación. Intenta nuevamente."};}
}
function check(error:{message?:string;code?:string}|null) {
  if(!error)return;
  if(error.code==="PGRST202")throw new CatalogError("El filtro de estatus está pendiente de activación en Supabase. Selecciona Todos mientras se aplica la migración.");
  if(error.code==="42501")throw new CatalogError("No tienes acceso a Servicios.");
  if(error.message?.includes("SERVICE_CONFLICT"))throw new CatalogError("La OC cambió en otra sesión. Actualiza el catálogo antes de completar el servicio.");
  if(error.message?.includes("SERVICE_STATUS"))throw new CatalogError("Solo se pueden completar servicios de una OC registrada.");
  if(error.message?.includes("SERVICE_DATE"))throw new CatalogError("La fecha actual no puede ser anterior a la fecha de la OC.");
  if(error.message?.includes("SERVICE_NOT_FOUND"))throw new CatalogError("El servicio ya no existe en esta razón social. Actualiza el catálogo.");
  throw new CatalogError("No se pudo guardar o consultar el servicio en Supabase. Intenta nuevamente.");
}
export async function listServices(business:string,search:string,page:number,status:string=""):Promise<ActionResult<ServiceList>> {
  return run(async()=>{
    const {db}=await requireAccess("services");
    if(!["","pending","partial","complete"].includes(status))throw new CatalogError("Estatus no válido.");
    const {data,error}=await db.rpc("service_catalog",{business:businessId(business),search_text:typeof search==="string"?search.trim().slice(0,100):"",page_number:Number.isSafeInteger(page)?Math.max(0,page):0,...(status?{status_filter:status}:{})});
    check(error);return data as ServiceList;
  });
}
export async function completeService(business:string,id:string,revision:number):Promise<ActionResult<string>> {
  return run(async()=>{
    const {db}=await requireAccess("services");
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)||!Number.isSafeInteger(revision)||revision<1)throw new CatalogError("Servicio o versión no válido.");
    const {data,error}=await db.rpc("complete_order_service",{business:businessId(business),target:id,expected:revision});
    check(error);return String(data);
  });
}
