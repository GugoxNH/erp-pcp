import {requireAccess} from '../../../../lib/access-server';
import {createAdminClient} from '../../../../lib/supabase/admin';
import {availableEmailSenders,deliverPurchaseEmail} from '../../../../lib/purchase-email-send';
import {parsePurchaseEmail,type EmailOutcome} from '../../../../lib/purchase-email-model';
export const runtime='nodejs';
export const maxDuration=120;
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 try{
  const {user,db}=await requireAccess('purchases');const url=new URL(request.url),id=url.searchParams.get('requestId');
  if(id){
   const {data,error}=await db.from('purchase_email_sends').select('state,result,created_at').eq('id',id).eq('actor_id',user.id).maybeSingle();
   if(error)throw Error();
   if(!data)return reply({state:'unknown',message:'No se encontró un resultado guardado. No repitas el envío hasta comprobarlo.'});
   if(data.state==='sending'&&Date.now()-new Date(data.created_at).getTime()>180000){
    const result={state:'unknown',message:'El proceso no terminó con una confirmación. Comprueba el envío antes de repetir.'};
    const saved=await createAdminClient().rpc('finish_purchase_email',{request_id:id,owner_id:user.id,outcome:'unknown',summary:result});
    if(saved.error)throw Error();return reply(result);
   }
   return reply(data.result??{state:data.state,message:'El envío sigue en proceso. Consulta el resultado en unos momentos.'});
  }
  // No sending is offered until the durable audit/idempotency schema is available.
  const check=await db.from('purchase_email_sends').select('id').limit(0);
  if(check.error)return reply({senders:[],error:'Falta activar el registro de envíos en Supabase.'});
  return reply({senders:await availableEmailSenders(user.id)});
 }catch{return reply({error:'No se pudo consultar el estado del correo. Revisa tu sesión.'},400);}
}
async function boundedForm(request:Request){
 const limit=22*1024*1024;
 if(Number(request.headers.get('content-length'))>limit)throw Error('El correo supera el tamaño permitido.');
 const reader=request.body?.getReader();if(!reader)throw Error('Faltan los datos del correo.');
 const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('El correo supera el tamaño permitido.');}chunks.push(value);}}finally{reader.releaseLock();}
 try{
  return await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
 }catch{
  throw Error('No se recibió completo el formulario o sus adjuntos. Intenta enviarlo nuevamente; este intento no envió ningún correo.');
 }
}
export async function POST(request:Request){
 let context:Awaited<ReturnType<typeof requireAccess>>;
 try{
  const origin=request.headers.get('origin');
  if(!origin||new URL(origin).host!==request.headers.get('host')||!['http:','https:'].includes(new URL(origin).protocol))return reply({error:'Origen no permitido.'},403);
  context=await requireAccess('purchases');
 }catch{return reply({error:'No tienes permiso para enviar correos de compras.'},403);}
 let input:Awaited<ReturnType<typeof parsePurchaseEmail>>;
 try{input=await parsePurchaseEmail(await boundedForm(request));}catch(e){return reply({error:e instanceof Error?e.message:'Correo inválido.'},400);}
 const {db,user}=context;
 const claim=await db.rpc('claim_purchase_email',{request_id:input.id,target:input.purchase,business:input.business,fingerprint:input.fingerprint,info:{provider:input.provider,from:input.sender,to:input.to,cc:input.cc,subject:input.subject,attachments:input.attachments.map(f=>({name:f.filename,size:f.content.length}))}});
 if(claim.error)return reply({error:claim.error.message.includes('EMAIL_CONFLICT')?'Este intento ya corresponde a otro contenido. Consulta su resultado antes de preparar un nuevo correo.':'No se pudo registrar el intento. Comprueba la compra y la activación de Bitácora. No se envió el correo.'},409);
 if(!claim.data.claimed)return reply(claim.data.result??{state:claim.data.state,message:'Este intento ya fue registrado. Consulta su resultado; no se enviará nuevamente.'});
 let outcome:EmailOutcome;
 try{outcome=await deliverPurchaseEmail(user.id,input);}catch{outcome={state:'unknown',message:'El envío no terminó con una confirmación. Revisa antes de repetir.'};}
 const saved=await createAdminClient().rpc('finish_purchase_email',{request_id:input.id,owner_id:user.id,outcome:outcome.state,summary:outcome});
 if(saved.error)return reply({state:'unknown',message:outcome.state==='sent'?'El servidor aceptó el correo, pero no se pudo guardar la confirmación en Bitácora. No lo reenvíes.':'No se pudo guardar el resultado. El intento inicial está registrado; comprueba el envío antes de repetir.'},500);
 return reply(outcome);
}
