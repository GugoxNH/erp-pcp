import 'server-only';
import nodemailer from 'nodemailer';
import {createAdminClient} from './supabase/admin';
import {companyEmailInput,companyEmailStatus} from './company-email';
import {gmailClient,gmailStatus} from './gmail';
import {openGmail} from './gmail-crypto';
import type {EmailOutcome,EmailSender,PurchaseEmailInput} from './purchase-email-model';

export async function availableEmailSenders(userId:string):Promise<EmailSender[]>{
 const [company,gmail]=await Promise.all([companyEmailStatus(userId),gmailStatus(userId)]);
 const result:EmailSender[]=[];
 if(company.ready&&company.email)result.push({provider:'company',email:company.email});
 if(gmail.ready&&gmail.email)result.push({provider:'gmail',email:gmail.email});
 return result;
}
export async function deliverPurchaseEmail(userId:string,input:PurchaseEmailInput):Promise<EmailOutcome>{
 const admin=createAdminClient();let submitted=false;
 try{
  const company=input.provider==='company';
  const {data,error}=await admin.from(company?'company_email_connections':'gmail_connections').select(company?'email,password_encrypted,host,port':'email,refresh_token_encrypted').eq('user_id',userId).maybeSingle();
  if(error||!data)return {state:'failed',message:'El correo seleccionado ya no está disponible. Revisa Perfil.'};
  const row=data as unknown as {email:string;password_encrypted:string;host:string;port:number;refresh_token_encrypted:string};
  if(row.email.toLowerCase()!==input.sender)return {state:'failed',message:'El remitente cambió desde que abriste el borrador. Cierra y vuelve a abrir para seleccionar la cuenta actual.'};
  const message={from:row.email,to:input.to,cc:input.cc,subject:input.subject,text:input.body,attachments:input.attachments,messageId:`<${input.id}@erp.pesaje.com.mx>`,disableFileAccess:true,disableUrlAccess:true};
  if(company){
   const config=companyEmailInput(row.email,openGmail(row.password_encrypted,`company-email:${userId}`));
   if(row.host!==config.host||row.port!==465)throw Error('Invalid stored server');
   const transport=nodemailer.createTransport({host:config.host,port:465,secure:true,auth:{user:config.email,pass:config.password},tls:{servername:config.host,rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:60000,dnsTimeout:10000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
   try{
    submitted=true;const info=await transport.sendMail(message);
    const accepted=(info.accepted??[]).map(String),rejected=(info.rejected??[]).map(String);
    return {state:!accepted.length?'failed':rejected.length?'partial':'sent',message:!accepted.length?'El servidor no aceptó ningún destinatario.':rejected.length?'El servidor aceptó algunos destinatarios y rechazó otros. No reenvíes a los aceptados.':'Correo enviado con éxito. El servidor aceptó el mensaje.',accepted,rejected,messageId:info.messageId};
   }finally{transport.close();}
  }
  const client=gmailClient();client.setCredentials({refresh_token:openGmail(row.refresh_token_encrypted,userId)});
  const access=await client.getAccessToken();if(!access.token)throw Error('Missing access');
  const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows',disableFileAccess:true,disableUrlAccess:true});
  const mime=await composer.sendMail(message);
  if(!Buffer.isBuffer(mime.message))throw Error('MIME buffer unavailable');
  // Use a single request: automatic retries could duplicate an already accepted email.
  submitted=true;
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${access.token}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime.message).toString('base64url')}),signal:AbortSignal.timeout(60000)});
  if(!response.ok)return {state:response.status>=500?'unknown':'failed',message:response.status>=500?'Google no confirmó el resultado. Revisa Enviados antes de repetir.':'Google rechazó el envío. Revisa tu conexión en Perfil y los destinatarios.'};
  const result=await response.json();
  if(!result.id)return {state:'unknown',message:'Google no devolvió la confirmación esperada. Revisa Enviados antes de repetir.'};
  return {state:'sent',message:'Correo enviado con éxito mediante Gmail.',accepted:[...input.to,...input.cc],rejected:[],messageId:String(result.id)};
 }catch(e){
  const code=(e as {code?:string}).code;
  const responseCode=(e as {responseCode?:number}).responseCode??0;
  const failed=!submitted||(responseCode>=400&&responseCode<600)||['EAUTH','EENVELOPE','EMESSAGE','EDNS','ECONNECTION','ETLS'].includes(code??'');
  return {state:failed?'failed':'unknown',message:code==='EAUTH'?'El servidor rechazó las credenciales. Vuelve a validar el correo en Perfil.':failed?'No se pudo enviar el correo. Revisa la conexión en Perfil e intenta nuevamente.':'Se perdió la confirmación del servidor. El correo podría haberse enviado; comprueba el buzón o consulta al proveedor antes de repetir.'};
 }
}
