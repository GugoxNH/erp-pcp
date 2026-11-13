"use server";
import {hasPermission} from '../lib/access';
import {requireAccess} from '../lib/access-server';
import {validateStockAdjustment,type StockAdjustment} from '../lib/warehouse';
import {businessId,type ActionResult} from '../lib/catalog-model';
import {validateReceipt,type ReceiptInput,type ReceiptPurchase,type ReceiptSummary,type ReceiptDetail,type WarehouseBalance} from '../lib/warehouse';

async function run<T>(fn:()=>Promise<T>):Promise<ActionResult<T>> {
 try{return {ok:true,value:await fn()};}catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo completar la operación.'};}
}
export async function adjustWarehouseStock(input:StockAdjustment):Promise<ActionResult<string>> {return run(async()=>{
 const {db,profile}=await requireAccess('warehouse');
 if(!hasPermission(profile,"edit_warehouse"))throw new Error('No tienes el permiso Editar almacen.');
 const payload=validateStockAdjustment(input);
 const {data,error}=await db.rpc('adjust_warehouse_stock',{payload});
 if(error){
  const messages:Record<string,string>={ACCESS_DENIED:'No tienes el permiso Editar almacen.',ADJUSTMENT_STALE:'El stock cambió en otra sesión. Cierra el formulario y actualiza las existencias.',ADJUSTMENT_RESERVED:'La existencia no puede ser menor que la cantidad asignada a OC.',ADJUSTMENT_UNCHANGED:'La cantidad es igual a la existencia actual.',ADJUSTMENT_CONFLICT:'Este ajuste ya se registró con otros datos. Actualiza las existencias.',ADJUSTMENT_INVALID:'Revisa el producto, la cantidad y el motivo.'};
  throw new Error(Object.entries(messages).find(([code])=>error.message.includes(code))?.[1]??'No se pudo confirmar el ajuste. Reintenta sin cerrar el formulario.');
 }
 return String(data);
});}
function check(error:{message?:string;code?:string}|null){
 if(!error)return;
 const messages:Record<string,string>={
  RECEIPT_EXCESS:'La cantidad supera lo pendiente por recibir. Cierra y vuelve a abrir la recepción para actualizar los saldos.',
  RECEIPT_PURCHASE:'Solo puedes recibir compras emitidas de la razón social seleccionada.',
  RECEIPT_DATE:'La fecha debe estar entre la fecha de compra y el día de hoy.',
  RECEIPT_CONFLICT:'Esta recepción ya fue registrada con otros datos. Cierra el formulario y revisa el historial.',
  RECEIPT_AMOUNT:'Captura cantidades positivas con hasta cuatro decimales.',
  RECEIPT_DESTINATION:'El destino no pertenece a esta compra.',
  RECEIPT_NOT_FOUND:'No se encontró la recepción.',
  RECEIPT_INVALID:'Revisa los datos de la recepción.',
 };
 for(const [code,message] of Object.entries(messages))if(error.message?.includes(code))throw new Error(message);
 if(error.code==='23505')throw new Error('La recepción contiene destinos repetidos o ya fue registrada.');
 throw new Error('No se pudo consultar o registrar la entrada al almacén.');
}
export async function getReceiptOptions(business:string):Promise<ActionResult<ReceiptPurchase[]>>{return run(async()=>{
 const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_purchase_options',{business:businessId(business)});check(error);return data;
});}
export async function listReceipts(business:string,page:number):Promise<ActionResult<{rows:ReceiptSummary[];count:number}>>{return run(async()=>{
 const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_receipt_list',{business:businessId(business),page_number:Number.isSafeInteger(page)?page:0});check(error);return data;
});}
export async function getReceipt(business:string,id:string):Promise<ActionResult<ReceiptDetail>>{return run(async()=>{
 const {db}=await requireAccess('warehouse');const {data,error}=await db.rpc('warehouse_receipt_document',{business:businessId(business),target:id});check(error);return data;
});}
export async function saveReceipt(input:ReceiptInput):Promise<ActionResult<string>>{return run(async()=>{
 const {db}=await requireAccess('warehouse');const payload=validateReceipt(input);const {data,error}=await db.rpc('receive_supplier_purchase',{payload});check(error);return String(data);
});}
export async function getWarehouseBalances(business:string):Promise<ActionResult<WarehouseBalance[]>>{return run(async()=>{
 const {db}=await requireAccess('warehouse');const rows:WarehouseBalance[]=[];
 for(let offset=0;;offset+=1000){const {data,error}=await db.rpc('warehouse_balances',{business:businessId(business)}).range(offset,offset+999);check(error);rows.push(...data??[]);if(!data||data.length<1000)return rows;}
});}
