"use server";
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireAccess} from '../lib/access-server';
import {createAdminClient} from '../lib/supabase/admin';
import {checkGmailEncryption,sealGmail} from '../lib/gmail-crypto';
import {companyEmailInput,verifyCompanyEmail} from '../lib/company-email';
import type {ActionResult} from '../lib/catalog-model';
export async function validateCompanyEmail(email:string,password:string):Promise<ActionResult<null>>{
 try{
  const {user}=await requireAccess();const input=companyEmailInput(email,password);
  checkGmailEncryption();const admin=createAdminClient(),attempt=randomUUID();
  const start=await admin.rpc('begin_company_email_check',{owner_id:user.id,attempt});
  if(start.error)return {ok:false,error:start.error.message.includes('EMAIL_RATE_LIMIT')?'Alcanzaste el límite de 5 intentos. Espera 15 minutos antes de volver a probar.':'No se pudo iniciar la validación. Revisa que Correo de empresa esté activado en Supabase.'};
  await verifyCompanyEmail(input);
  const finish=await admin.rpc('finish_company_email_check',{owner_id:user.id,attempt,address:input.email,server_host:input.host,encrypted_password:sealGmail(input.password,`company-email:${user.id}`)});
  if(finish.error)return {ok:false,error:'La conexión fue aceptada, pero no se guardó. Otra operación pudo cambiar tu configuración. Vuelve a intentarlo.'};
  revalidatePath('/perfil');return {ok:true,value:null};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo validar el correo.'};}
}
export async function disconnectCompanyEmail():Promise<ActionResult<null>>{
 try{
  const {user}=await requireAccess();const {error}=await createAdminClient().rpc('disconnect_company_email',{owner_id:user.id});
  if(error)return {ok:false,error:'No se pudo desconectar el correo. Intenta nuevamente.'};
  revalidatePath('/perfil');return {ok:true,value:null};
 }catch{return {ok:false,error:'No se pudo desconectar el correo. Revisa tu sesión.'};}
}
