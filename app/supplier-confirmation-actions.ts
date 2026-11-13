"use server";
import {requireAccess} from '../lib/access-server';
import {businessId,type ActionResult} from '../lib/catalog-model';
export type SupplierConfirmation={number:string;date:string};
export async function getSupplierConfirmation(business:string,id:string):Promise<ActionResult<SupplierConfirmation|null>>{
 try{const {db}=await requireAccess('purchases');const {data,error}=await db.from('supplier_purchases').select('supplier_confirmation,supplier_confirmed_at').eq('business_id',businessId(business)).eq('id',id).single();
 if(error)throw Error('No se pudo consultar la confirmación del proveedor.');
 return {ok:true,value:data.supplier_confirmed_at?{number:data.supplier_confirmation,date:data.supplier_confirmed_at}:null};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo consultar la confirmación.'};}
}
export async function confirmSupplierPurchase(business:string,id:string,confirmation:string):Promise<ActionResult<SupplierConfirmation>>{
 try{const {db}=await requireAccess('purchases');if(typeof confirmation!=='string'||!confirmation.trim()||confirmation.trim().length>200)throw Error('Introduce el número de confirmación (máximo 200 caracteres).');
 const {data,error}=await db.rpc('confirm_supplier_purchase',{business:businessId(business),target:id,confirmation:confirmation.trim()});
 if(error)throw Error(error.message.includes('CONFIRM_ALREADY')?'La compra ya fue validada en otra sesión. Cierra y vuelve a abrir para consultar la confirmación.':error.message.includes('CONFIRM_CANCELLED')?'No puedes validar una compra cancelada.':'No se pudo guardar la confirmación del proveedor.');
 return {ok:true,value:data};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo validar la confirmación.'};}
}
