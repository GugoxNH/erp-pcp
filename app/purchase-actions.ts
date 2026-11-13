"use server";
import {requireAccess} from "../lib/access-server";
import {createAdminClient} from "../lib/supabase/admin";
import {businessId,type ActionResult} from "../lib/catalog-model";
import {validatePurchase,type Purchase,type PurchaseSummary,type PurchaseOptions,type PurchaseEvent} from "../lib/purchases";
async function run<T>(fn:()=>Promise<T>):Promise<ActionResult<T>>{try{return {ok:true,value:await fn()};}catch(e){return {ok:false,error:e instanceof Error?e.message:"No se pudo completar la operación."};}}
function check(error:{message?:string;code?:string}|null){if(!error)return;
 if(error.message?.includes('PURCHASE_RFC'))throw new Error('Revisa el RFC de la razón social antes de crear una compra.');
 if(error.message?.includes('PURCHASE_USER_NAME'))throw new Error('Captura el nombre completo del usuario para generar las iniciales.');
 if(error.message?.includes('PURCHASE_VENDOR_PRODUCT'))throw new Error('Un producto no está asociado al proveedor seleccionado. Revisa sus proveedores en el catálogo de productos.');
 if(error.message?.includes('PURCHASE_RECEIVED'))throw new Error('La compra ya tiene entradas al almacén y no se puede cancelar.');
 const messages:Record<string,string>={PURCHASE_CONFLICT:"La compra cambió en otra sesión. Actualiza el listado.",PURCHASE_FINAL:"Una compra emitida o cancelada no se puede editar.",PURCHASE_TARGET_EXCESS:"La cantidad asignada supera lo pendiente de comprar de una partida del cliente. Actualiza las opciones.",PURCHASE_EXCESS:"Las asignaciones superan la cantidad de la compra.",PURCHASE_UNIT:"Las unidades de la compra y de la partida del cliente no son equivalentes. Revisa sus unidades.",PURCHASE_TARGET:"El destino debe ser una refacción pendiente de una OC registrada de esta razón social y del mismo producto.",PURCHASE_PRODUCT:"Selecciona un producto activo.",PURCHASE_SUPPLIER:"Selecciona un proveedor activo.",PURCHASE_REASON:"Escribe el motivo de cancelación.",PURCHASE_INVALID:"Revisa los datos y las asignaciones de la compra.",PURCHASE_AMOUNT:"Revisa cantidades e importes.",PURCHASE_NOT_FOUND:"La compra no está disponible."};
 for(const [key,message] of Object.entries(messages))if(error.message?.includes(key))throw new Error(message);
 if(error.code==='23505')throw new Error("El número de compra ya existe o hay destinos repetidos.");
 throw new Error("No se pudo guardar o consultar la compra. Revisa los datos e intenta nuevamente.");
}
export async function purchaseOptions(business:string,id:string|null):Promise<ActionResult<PurchaseOptions>>{return run(async()=>{const {db}=await requireAccess('purchases');const {data,error}=await db.rpc('purchase_options',{business:businessId(business),excluded_purchase:id});check(error);return data as PurchaseOptions;});}
export async function previewPurchaseNumber(business:string):Promise<ActionResult<string>>{return run(async()=>{const {db}=await requireAccess('purchases');const {data,error}=await db.rpc('preview_purchase_number',{business:businessId(business)});check(error);if(typeof data!=="string"||!data)throw new Error("No se pudo generar el número de compra.");return data;});}
export async function listPurchases(business:string,search:string,status:string,page:number):Promise<ActionResult<{rows:PurchaseSummary[];count:number}>>{return run(async()=>{
 const {db}=await requireAccess('purchases');const offset=(Number.isSafeInteger(page)?Math.max(0,page):0)*20;
 let query=db.from('supplier_purchases').select('*,tax::text,total::text,subtotal::text',{count:'exact'}).eq('business_id',businessId(business));
 if(['draft','ordered','cancelled'].includes(status))query=query.eq('status',status);
 if(search.trim())query=query.ilike('number',`%${search.trim().slice(0,100).replace(/[\\%_]/g,'\\$&')}%`);
 const {data,error,count}=await query.order('created_at',{ascending:false}).order('id').range(offset,offset+19);check(error);return {rows:(data??[]) as PurchaseSummary[],count:count??0};
});}
export async function getPurchase(business:string,id:string):Promise<ActionResult<Purchase & {events:PurchaseEvent[]}>>{return run(async()=>{const {db}=await requireAccess('purchases');const {data,error}=await db.rpc('supplier_purchase_document',{business:businessId(business),target:id});check(error);return data;});}
export async function purchaseEmailContext(business:string,id:string):Promise<ActionResult<{purchase:Purchase;contacts:{name:string;email:string}[];sender:string}>>{return run(async()=>{
 const {db,profile}=await requireAccess('purchases');
 const {data,error}=await db.rpc('supplier_purchase_document',{business:businessId(business),target:id});check(error);
 const purchase=data as Purchase;
 if(!purchase||purchase.status==='cancelled')throw new Error('La compra no está disponible para preparar un correo.');
 // Resolve only the supplier of a purchase the caller can access; do not expose the supplier catalog.
 const {data:supplier,error:supplierError}=await createAdminClient().from('suppliers').select('contacts,contact_name,email').eq('id',purchase.supplier_id).single();
 if(supplierError)throw new Error('No se pudieron consultar los contactos del proveedor.');
 const contacts=(Array.isArray(supplier.contacts)?supplier.contacts:[]).filter((c:{email?:string})=>c.email?.trim()).map((c:{name:string;email:string})=>({name:c.name,email:c.email}));
 if(!contacts.length&&supplier.email)contacts.push({name:supplier.contact_name,email:supplier.email});
 return {purchase,contacts,sender:profile.full_name};
});}
export async function savePurchase(purchase:Purchase):Promise<ActionResult<string>>{return run(async()=>{const {db}=await requireAccess('purchases');const payload=validatePurchase(purchase);const {data,error}=await db.rpc('save_supplier_purchase',{payload});check(error);return String(data);});}
export async function cancelPurchase(business:string,id:string,revision:number,reason:string):Promise<ActionResult<void>>{return run(async()=>{const {db}=await requireAccess('purchases');const {error}=await db.rpc('cancel_supplier_purchase',{business:businessId(business),target:id,expected:revision,reason});check(error);});}
export type OrderPurchaseAssignment={item_id:string;position:number;purchase_number:string;supplier:string;status:"draft"|"ordered"|"cancelled";quantity:string;unit:string};
export async function orderPurchaseAssignments(business:string,id:string):Promise<ActionResult<OrderPurchaseAssignment[]>>{return run(async()=>{const {db}=await requireAccess('orders');const rows:OrderPurchaseAssignment[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.rpc('order_purchase_assignments',{business:businessId(business),customer_order:id}).range(offset,offset+999);check(error);rows.push(...data??[]);if(!data||data.length<1000)return rows;}});}
