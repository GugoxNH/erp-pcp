import Decimal from "decimal.js";

export type ReceiptInput = {id:string; business_id:string; purchase_id:string; date:string; reference:string; invoice:string; notes:string; items:{line_id:string; item_id:string|null; quantity:string}[]};
export type ReceiptBucket = {line_id:string; item_id:string|null; position:number; description:string; unit:string; destination:string; planned:string; received:string; remaining:string};
export type ReceiptPurchase = {id:string; number:string; supplier:string; date:string; buckets:ReceiptBucket[]};
export type ReceiptSummary = {id:string; folio:number; date:string; reference:string; invoice:string; purchase_number:string; supplier:string; actor_name:string; created_at:string; notes:string};
export type ReceiptDetail = ReceiptSummary & {items:{id:string; description:string; unit:string; quantity:string; destination:string}[]};
export type WarehouseBalance = {product_id:string; sku:string; description:string; unit:string; quantity:string; reserved:string; available:string};
export type StockAdjustment = {id:string;business_id:string;product_id:string;unit:string;expected:string;quantity:string;reason:string};
export function validateStockAdjustment(v:StockAdjustment):StockAdjustment {
 if(!v||!uuid(v.id)||!uuid(v.product_id)||!['pcp','jose','taasa'].includes(v.business_id))throw new Error('Producto o empresa inválidos.');
 if(typeof v.unit!=='string'||!v.unit.trim()||v.unit.length>30)throw new Error('Unidad inválida.');
 if(typeof v.quantity!=='string'||!/^\d{1,9}(\.\d{1,4})?$/.test(v.quantity)||new Decimal(v.quantity).gt(999999999))throw new Error('Captura una existencia entre 0 y 999999999 con hasta cuatro decimales.');
 if(typeof v.expected!=='string'||!/^\d+(\.\d{1,4})?$/.test(v.expected)||v.expected.length>30)throw new Error('Actualiza las existencias.');
 if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>1000)throw new Error('Indica un motivo de hasta 1000 caracteres.');
 return {...v,reason:v.reason.trim()};
}
export const receiptKey = (b:Pick<ReceiptBucket,'line_id'|'item_id'>)=>`${b.line_id}:${b.item_id??'stock'}`;
export function localReceiptDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City'}).format(new Date());}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function validateReceipt(input:ReceiptInput):ReceiptInput {
 if(!input||!uuid(input.id)||!uuid(input.purchase_id)||!['pcp','jose','taasa'].includes(input.business_id))throw new Error('Selecciona una compra válida.');
 if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date||input.date<'1900-01-01'||input.date>localReceiptDate())throw new Error('Captura una fecha de recepción válida, no futura.');
 if(typeof input.reference!=='string'||input.reference.trim().length>100||typeof input.invoice!=='string'||input.invoice.trim().length>100||typeof input.notes!=='string'||input.notes.length>4000)throw new Error('Revisa la remisión, la factura y las observaciones.');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>1000)throw new Error('Captura una cantidad recibida en al menos un destino.');
 const seen=new Set<string>();
 const items=input.items.map(i=>{
  if(!i||!uuid(i.line_id)||(i.item_id!==null&&!uuid(i.item_id)))throw new Error('Destino inválido.');
  const key=receiptKey(i).toLowerCase();if(seen.has(key))throw new Error('No repitas destinos.');seen.add(key);
  if(typeof i.quantity!=='string'||!/^\d{1,9}(\.\d{1,4})?$/.test(i.quantity)||new Decimal(i.quantity).lte(0))throw new Error('Las cantidades recibidas deben ser positivas, con hasta cuatro decimales.');
  return {line_id:i.line_id,item_id:i.item_id,quantity:i.quantity};
 });
 return {id:input.id,business_id:input.business_id,purchase_id:input.purchase_id,date:input.date,reference:input.reference.trim(),invoice:input.invoice.trim(),notes:input.notes.trim(),items};
}
