import Decimal from "decimal.js";
export type Allocation = {item_id:string; quantity:string; label?:string};
export type PurchaseEvent = {revision:number; actor_name:string; occurred_at:string; status:"draft"|"ordered"|"cancelled"};
export type PurchaseLine = {id:string; product_id:string; description:string; unit:string; quantity:string; unit_price:string; allocations:Allocation[]};
export type Purchase = {id:string; business_id:string; supplier_id:string; supplier_name:string; number:string; date:string; expected_date:string; currency:string; status:"draft"|"ordered"|"cancelled"; notes:string; cancellation_reason:string; tax:string; revision:number; items:PurchaseLine[]};
export type PurchaseSummary = Omit<Purchase,"items"> & {total:string;supplier_confirmation?:string|null;supplier_confirmed_at?:string|null};
export type PurchaseOptions = {suppliers:{id:string;name:string}[];products:{id:string;sku:string;name:string;unit:string;supplier_ids:string[]}[];targets:{id:string;order_id:string;number:string;client:string;position:number;product_id:string;description:string;unit:string;remaining:string}[]};
export const purchaseStatuses={draft:"Borrador",ordered:"Emitida",cancelled:"Cancelada"};
export function newPurchase(business_id:string):Purchase {const d=new Date();return {id:crypto.randomUUID(),business_id,supplier_id:"",supplier_name:"",number:"",date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,expected_date:"",currency:"MXN",status:"draft",notes:"",cancellation_reason:"",tax:"0",revision:0,items:[newPurchaseLine()]};}
export function newPurchaseLine():PurchaseLine{return {id:crypto.randomUUID(),product_id:"",description:"",unit:"",quantity:"1",unit_price:"0",allocations:[]};}
export function stockQuantity(line:PurchaseLine){return new Decimal(line.quantity).minus(line.allocations.reduce((s,a)=>s.plus(a.quantity),new Decimal(0))).toFixed();}
export function purchaseTotal(p:Pick<Purchase,"items"|"tax">){return p.items.reduce((s,i)=>s.plus(new Decimal(i.quantity).mul(i.unit_price).toDecimalPlaces(2)),new Decimal(p.tax)).toFixed(2);}
export function purchaseAutomaticTax(items:PurchaseLine[]):string {
 const subtotal=items.reduce((sum,item)=>{
  for(const value of [item.quantity,item.unit_price]) if(!/^\d{1,9}(\.\d{1,4})?$/.test(value)) throw new Error("Revisa cantidades y precios.");
  return sum.plus(new Decimal(item.quantity).mul(item.unit_price).toDecimalPlaces(2));
 },new Decimal(0));
 return subtotal.mul("0.16").toFixed(2);
}
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function amount(v:unknown,positive=false,scale=4){if(typeof v!=="string"||!new RegExp(`^\\d{1,9}(\\.\\d{1,${scale}})?$`).test(v)||new Decimal(v).lt(positive?"0.0001":0))throw new Error("Revisa cantidades e importes; usa punto decimal.");return v;}
function date(v:unknown){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2199-12-31')throw new Error("Revisa las fechas de la compra.");return v;}
export function validatePurchase(p:Purchase):Purchase {
 if(!p||!uuid(p.id)||!['pcp','taasa','jose'].includes(p.business_id)||!uuid(p.supplier_id)||!Number.isSafeInteger(p.revision)||p.revision<0)throw new Error("Datos de compra no válidos.");
 if(typeof p.number!=="string"||!p.number.trim()||p.number.trim().length>100)throw new Error("Captura el número de compra (máximo 100 caracteres).");
 if(!['draft','ordered'].includes(p.status)||!['MXN','USD','EUR'].includes(p.currency)||typeof p.notes!=="string"||p.notes.length>4000)throw new Error("Revisa estado, moneda y observaciones.");
 date(p.date);if(p.expected_date){date(p.expected_date);if(p.expected_date<p.date)throw new Error("La recepción esperada no puede ser anterior a la compra.");}
 amount(p.tax,false,2);
 if(!Array.isArray(p.items)||p.items.length<1||p.items.length>200)throw new Error("La compra requiere entre 1 y 200 partidas.");
 const ids=new Set<string>();
 const items=p.items.map(i=>{if(!uuid(i.id)||ids.has(i.id)||!uuid(i.product_id))throw new Error("Selecciona un producto en cada partida.");ids.add(i.id);amount(i.quantity,true);amount(i.unit_price);
 if(!Array.isArray(i.allocations)||i.allocations.length>200)throw new Error("Revisa las asignaciones.");const seen=new Set<string>();
 const allocations=i.allocations.map(a=>{if(!uuid(a.item_id)||seen.has(a.item_id))throw new Error("Selecciona partidas de cliente sin repetir dentro del mismo producto.");seen.add(a.item_id);return {item_id:a.item_id,quantity:amount(a.quantity,true)};});
 const line={...i,allocations};if(new Decimal(stockQuantity(line)).lt(0))throw new Error("Las asignaciones no pueden superar la cantidad comprada.");return line;});
 return {...p,number:p.number.trim(),notes:p.notes.trim(),items};
}
