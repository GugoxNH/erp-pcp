import 'server-only';
import {OAuth2Client} from 'google-auth-library';
import {checkGmailEncryption} from './gmail-crypto';
import {createAdminClient} from './supabase/admin';

export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send';
export const GMAIL_COOKIE='erp.gmail.oauth';
export function gmailConfig(){
 const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,redirect=process.env.GOOGLE_GMAIL_REDIRECT_URI;
 if(!id||!secret||!redirect)throw new Error('La conexión con Gmail aún no está configurada. Contacta al administrador.');
 const url=new URL(redirect);
 if(url.pathname!=='/api/gmail/callback'||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('La dirección de retorno de Gmail no es válida.');
 checkGmailEncryption();
 return {id,secret,redirect,origin:url.origin,secure:url.protocol==='https:'};
}
export function gmailClient(){const c=gmailConfig();return new OAuth2Client(c.id,c.secret,c.redirect);}
export async function gmailStatus(userId:string){
 let configurationError='';try{gmailConfig();}catch(e){configurationError=e instanceof Error?e.message:'Gmail no está configurado.';}
 try{
  const {data,error}=await createAdminClient().from('gmail_connections').select('email,connected_at').eq('user_id',userId).maybeSingle();
  if(error)return {email:null,connectedAt:null,ready:false,error:'Falta activar o verificar la conexión de Gmail en la base de datos.'};
  return {email:data?.email as string|null??null,connectedAt:data?.connected_at as string|null??null,ready:!configurationError,error:configurationError};
 }catch{return {email:null,connectedAt:null,ready:false,error:'Falta configurar el servicio de Gmail en el servidor.'};}
}
