import 'server-only';
import nodemailer from 'nodemailer';
import {validateEmail} from './access';
import {createAdminClient} from './supabase/admin';
import {checkGmailEncryption} from './gmail-crypto';
// Only a server-controlled destination receives credentials; never trust client hosts.
export function companyEmailInput(email:unknown,password:unknown){
 const address=validateEmail(email);
 if(address.split('@')[1]!=='pesaje.com.mx')throw new Error('Por ahora está configurado el dominio pesaje.com.mx.');
 if(typeof password!=='string'||!password.length||password.length>512)throw new Error('Introduce la contraseña del correo (máximo 512 caracteres).');
 return {email:address,password,host:'mail.pesaje.com.mx',port:465};
}
export async function verifyCompanyEmail(input:ReturnType<typeof companyEmailInput>){
 const transport=nodemailer.createTransport({host:input.host,port:465,secure:true,
  auth:{user:input.email,pass:input.password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:input.host},
  connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000,dnsTimeout:10000,
  logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
 try{await transport.verify();}catch(e){
  const code=(e as {code?:string}).code;
  throw new Error(code==='EAUTH'?'El servidor rechazó el correo o la contraseña. Revisa tus datos.':code==='ETIMEDOUT'?'El servidor tardó demasiado en responder. Intenta más tarde.':'No se pudo validar una conexión segura con el servidor. Intenta más tarde o consulta al proveedor.');
 }finally{transport.close();}
}
export type CompanyEmailStatus={email:string|null;validatedAt:string|null;ready:boolean;error:string};
export async function companyEmailStatus(userId:string):Promise<CompanyEmailStatus>{
 try{
  checkGmailEncryption();
  const {data,error}=await createAdminClient().from('company_email_connections').select('email,validated_at').eq('user_id',userId).maybeSingle();
  if(error)return {email:null,validatedAt:null,ready:false,error:'Falta activar Correo de empresa en Supabase.'};
  return {email:data?.email??null,validatedAt:data?.validated_at??null,ready:true,error:''};
 }catch{return {email:null,validatedAt:null,ready:false,error:'Falta configurar el servicio de correo de empresa en el servidor.'};}
}
