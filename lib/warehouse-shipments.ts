import Decimal from 'decimal.js';
import {localReceiptDate} from './warehouse';
export type ShipmentInput={id:string;business_id:string;order_id:string;date:string;reference:string;invoice:string;recipient:string;notes:string;items:{item_id:string;quantity:string}[]};
export type ShippingItem={id:string;position:number;description:string;unit:string;quantity:string;shipped:string;pending:string;reserved:string;available:string;legacy:boolean};
export type ShippingOrder={id:string;number:string;date:string;client:string;delivery_address:string;items:ShippingItem[]};
export type ShipmentSummary={id:string;folio:number;date:string;order_number:string;client_name:string;reference:string;invoice:string;recipient:string;actor_name:string;created_at:string;delivery_address:string;notes:string};
export type ShipmentDetail=ShipmentSummary & {items:{id:string;position:number;description:string;unit:string;quantity:string;sources:{receipt_folio:number|null;adjustment_folio?:number|null;quantity:string;unit:string;origin:string}[]}[]};
export function shippingLimit(i:ShippingItem){return Decimal.min(i.pending,new Decimal(i.reserved).plus(i.available)).toFixed();}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function validateShipment(p:ShipmentInput):ShipmentInput {
 if(!p||!uuid(p.id)||!uuid(p.order_id)||!['pcp','taasa','jose'].includes(p.business_id))throw new Error('Selecciona una OC válida.');
 if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date||p.date<'1900-01-01'||p.date>localReceiptDate())throw new Error('Captura una fecha de salida válida, no futura.');
 for(const [key,max] of [['reference',100],['invoice',100],['recipient',160],['notes',4000]] as const)if(typeof p[key]!=='string'||p[key].length>max)throw new Error('Revisa remisión, factura, destinatario y observaciones.');
 if(!Array.isArray(p.items)||!p.items.length||p.items.length>200)throw new Error('Captura una cantidad a enviar en al menos una partida.');
 const seen=new Set<string>();
 const items=p.items.map(i=>{
  if(!i||!uuid(i.item_id)||seen.has(i.item_id.toLowerCase()))throw new Error('Selecciona partidas sin repetir.');seen.add(i.item_id.toLowerCase());
  if(typeof i.quantity!=='string'||!/^\d{1,9}(\.\d{1,4})?$/.test(i.quantity)||new Decimal(i.quantity).lte(0))throw new Error('Usa cantidades positivas con hasta cuatro decimales.');
  return {item_id:i.item_id,quantity:i.quantity};
 });
 return {id:p.id,business_id:p.business_id,order_id:p.order_id,date:p.date,reference:p.reference.trim(),invoice:p.invoice.trim(),recipient:p.recipient.trim(),notes:p.notes.trim(),items};
}
