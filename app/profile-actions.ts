"use server";
import {revalidatePath} from 'next/cache';
import {cookies,headers} from 'next/headers';
import {randomBytes} from 'node:crypto';
import {requireAccess} from '../lib/access-server';
import {validateEmail} from '../lib/access';
import type {ActionResult} from '../lib/catalog-model';
import {createAdminClient} from '../lib/supabase/admin';
import {gmailClient,gmailConfig,GMAIL_COOKIE,GMAIL_SCOPE} from '../lib/gmail';
import {gmailStateHash,sealGmail} from '../lib/gmail-crypto';

export async function saveMyProfile(version:string,name:string,username:string):Promise<ActionResult<null>>{
 try{
  const {db}=await requireAccess();
  if(typeof name!=='string'||!name.trim()||name.trim().length>160||typeof username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username.trim().toLowerCase()))throw new Error('Revisa el nombre completo y el usuario (3 a 40 letras sin acentos, números, puntos o guiones).');
  const {error}=await db.rpc('update_my_profile',{expected:version,display_name:name.trim(),login_name:username.trim().toLowerCase()});
  if(error)throw new Error(error.code==='23505'?'Ese usuario ya está registrado.':error.code==='PGRST202'?'Falta activar la edición de Perfil en Supabase.':error.message.includes('PROFILE_CONFLICT')?'Tus datos cambiaron en otra sesión. Actualiza la página antes de guardar.':'No se pudo guardar tu perfil.');
  revalidatePath('/','layout');return {ok:true,value:null};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo guardar tu perfil.'};}
}
export async function changeMyEmail(value:string):Promise<ActionResult<string>>{
 try{
  const {db,user}=await requireAccess();const email=validateEmail(value);
  if(email===user.email)throw new Error('Introduce un correo diferente al actual.');
  const origin=process.env.NEXT_PUBLIC_SITE_URL||(await headers()).get('origin');
  if(!origin)throw new Error('No se pudo determinar la dirección del ERP.');
  const {error}=await db.auth.updateUser({email},{emailRedirectTo:new URL('/auth/profile-callback',origin).toString()});
  if(error)throw new Error(error.status===429?'Espera unos minutos antes de solicitar otro cambio.':'No se pudo solicitar el cambio de correo. Revisa la dirección e intenta de nuevo.');
  revalidatePath('/perfil');return {ok:true,value:'Solicitud enviada. Revisa los mensajes de confirmación de Supabase en el correo actual y en el nuevo, según la configuración de la cuenta.'};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo cambiar tu correo.'};}
}
export async function connectMyGmail():Promise<ActionResult<string>>{
 try{
  const {user}=await requireAccess(),config=gmailConfig();
  // The callback must return to the same origin that owns the ERP session.
  if((await headers()).get('origin')!==config.origin)throw new Error(`Abre el ERP en ${config.origin} para conectar Gmail.`);
  const client=gmailClient(),state=randomBytes(32).toString('base64url');
  const pkce=await client.generateCodeVerifierAsync();
  const admin=createAdminClient();
  const cleanup=await admin.from('gmail_oauth_attempts').delete().lt('expires_at',new Date().toISOString());
  if(cleanup.error)throw new Error('Falta activar la conexión de Gmail en Supabase.');
  const {error}=await admin.from('gmail_oauth_attempts').insert({state_hash:gmailStateHash(state),user_id:user.id,verifier_encrypted:sealGmail(pkce.codeVerifier,user.id),expires_at:new Date(Date.now()+10*60*1000).toISOString()});
  if(error)throw new Error('No se pudo iniciar la conexión con Gmail.');
  (await cookies()).set(GMAIL_COOKIE,state,{httpOnly:true,sameSite:'lax',secure:config.secure,path:'/api/gmail/callback',maxAge:600});
  const url=client.generateAuthUrl({access_type:'offline',prompt:'consent select_account',scope:['openid','email',GMAIL_SCOPE],state,code_challenge:pkce.codeChallenge,code_challenge_method:'S256' as import('google-auth-library').CodeChallengeMethod,nonce:state});
  return {ok:true,value:url};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo conectar Gmail.'};}
}
export async function disconnectMyGmail():Promise<ActionResult<null>>{
 try{
  const {user}=await requireAccess(),admin=createAdminClient();
  const pending=await admin.from('gmail_oauth_attempts').delete().eq('user_id',user.id);
  if(pending.error)throw new Error('No se pudo desconectar Gmail. Intenta nuevamente.');
  const {error}=await admin.from('gmail_connections').delete().eq('user_id',user.id);
  if(error)throw new Error('No se pudo desconectar Gmail. Intenta nuevamente.');
  revalidatePath('/perfil');return {ok:true,value:null};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo desconectar Gmail.'};}
}
