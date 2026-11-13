"use server";
import {requireAccess} from '../lib/access-server';
import {businessId,type ActionResult} from '../lib/catalog-model';
import {validateShipment,type ShipmentInput,type ShippingOrder,type ShipmentSummary,type ShipmentDetail} from '../lib/warehouse-shipments';
async function run<T>(fn:()=>Promise<T>):Promise<ActionResult<T>>{try{return {ok:true,value:await fn()};}catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo completar la operación.'};}}
function check(error:{message?:string;code?:string}|null){
 if(!error)return;
 const messages:Record<string,string>={SHIPMENT_STOCK:'No hay suficientes existencias utilizables para la fecha de salida. Actualiza los saldos; el material reservado a otras OC no está disponible.',SHIPMENT_EXCESS:'La cantidad supera lo pendiente de enviar de la OC. Actualiza la selección.',SHIPMENT_ORDER:'Selecciona una OC registrada de la razón social actual.',SHIPMENT_DATE:'La fecha de salida debe estar entre la fecha de la OC y el día de hoy.',SHIPMENT_CONFLICT:'Esta salida ya se registró con otros datos. Revisa el historial.',SHIPMENT_ITEM:'La partida debe ser una refacción de esta OC y no estar repetida.',SHIPMENT_LEGACY:'La partida tiene un avance manual anterior sin cantidades de almacén. Revisa ese avance antes de registrar salidas para no duplicar envíos.',SHIPMENT_AMOUNT:'Revisa las cantidades a enviar.',SHIPMENT_NOT_FOUND:'No se encontró la salida.',SHIPMENT_INVALID:'Revisa los datos de la salida.'};
 for(const [code,message] of Object.entries(messages))if(error.message?.includes(code))throw new Error(message);
 throw new Error('No se pudo consultar o registrar la salida al almacén.');
}
export async function getShippingOptions(business:string):Promise<ActionResult<ShippingOrder[]>>{return run(async()=>{const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_shipping_options',{business:businessId(business)});check(error);return data;});}
export async function listShipments(business:string,page:number):Promise<ActionResult<{rows:ShipmentSummary[];count:number}>>{return run(async()=>{const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_shipment_list',{business:businessId(business),page_number:Number.isSafeInteger(page)?page:0});check(error);return data;});}
export async function getShipment(business:string,id:string):Promise<ActionResult<ShipmentDetail>>{return run(async()=>{const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_shipment_document',{business:businessId(business),target:id});check(error);return data;});}
export async function saveShipment(input:ShipmentInput):Promise<ActionResult<string>>{return run(async()=>{const {db}=await requireAccess('warehouse');const payload=validateShipment(input);const {data,error}=await db.rpc('ship_customer_order',{payload});check(error);return String(data);});}
