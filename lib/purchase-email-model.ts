import {createHash} from 'node:crypto';
export type EmailProvider='company'|'gmail';
export type EmailSender={provider:EmailProvider;email:string};
export type EmailOutcome={state:'sent'|'failed'|'partial'|'unknown'|'sending';message:string;accepted?:string[];rejected?:string[];messageId?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function addresses(value:string,required:boolean){
 const list=value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if((required&&!list.length)||list.length>50||list.some(s=>s.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(s)))throw Error('Revisa los destinatarios. Usa correos separados por comas (máximo 50).');
 return [...new Set(list)];
}
export async function parsePurchaseEmail(form:FormData){
 const str=(name:string)=>{const v=form.get(name);if(typeof v!=='string')throw Error('Faltan datos del correo.');return v;};
 const id=str('requestId'),purchase=str('purchase'),business=str('business'),provider=str('provider');
 if(!uuid.test(id)||!uuid.test(purchase)||!['pcp','taasa','jose'].includes(business)||!['company','gmail'].includes(provider))throw Error('Solicitud de correo inválida.');
 const senders=addresses(str('sender'),true);if(senders.length!==1)throw Error('Remitente inválido.');const sender=senders[0];
 const to=addresses(str('to'),true),cc=addresses(str('cc'),false).filter(s=>!to.includes(s));
 if(to.length+cc.length>50)throw Error('Máximo 50 destinatarios entre Para y CC.');
 const subject=str('subject').trim(),body=str('body');
 if(!subject||subject.length>300||/[\r\n\x00]/.test(subject)||!body.trim()||body.length>50000)throw Error('Revisa el asunto y mensaje (máximo 50,000 caracteres).');
 const files=form.getAll('files');let size=0;
 if(files.length>10)throw Error('Máximo 10 archivos.');
 const attachments=[];
 for(const file of files){
  if(!(file instanceof File)||!file.size||file.name.length>255||/[\r\n\x00]/.test(file.name))throw Error('Archivo adjunto inválido.');
  size+=file.size;if(size>20*1024*1024)throw Error('Los adjuntos superan 20 MB.');
  attachments.push({filename:file.name.replace(/[\\/]/g,'_'),content:Buffer.from(await file.arrayBuffer())});
 }
 const fingerprint=createHash('sha256').update(JSON.stringify({purchase,business,provider,sender,to,cc,subject,body,files:attachments.map(f=>({name:f.filename,hash:createHash('sha256').update(f.content).digest('hex')}))})).digest('hex');
 return {id,purchase,business,provider:provider as EmailProvider,sender,to,cc,subject,body,attachments,fingerprint};
}
export type PurchaseEmailInput=Awaited<ReturnType<typeof parsePurchaseEmail>>;
