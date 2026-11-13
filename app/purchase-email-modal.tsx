"use client";
import {Paperclip,Trash2,X,Copy,Send,LoaderCircle} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {confirmAction} from '../lib/alerts';
import type {EmailSender,EmailOutcome,EmailProvider} from '../lib/purchase-email-model';
import CrudModal from "./crud-modal";
import type {Purchase} from "../lib/purchases";

export type PurchaseEmailDraft={to:string;cc:string;subject:string;body:string;files:File[];contacts:{name:string;email:string}[];number:string;requestId?:string;result?:EmailOutcome;provider?:EmailProvider};
export function createPurchaseEmail(p:Purchase,company:string,sender:string,contacts:PurchaseEmailDraft['contacts']):PurchaseEmailDraft {
 const date=p.expected_date?p.expected_date.split('-').reverse().join('/'):'';
 return {to:contacts[0]?.email??'',cc:'',subject:`Orden de compra ${p.number} — ${company}`,number:p.number,contacts,files:[],body:`Buen día, equipo de ${p.supplier_name}:\n\nPor parte de ${company}, solicitamos el suministro de los siguientes productos correspondientes a nuestra orden de compra ${p.number}:\n\n${p.items.map((i,n)=>`${n+1}. ${i.description} — ${i.quantity} ${i.unit}`).join('\n')}\n\n${date?`Fecha de recepción solicitada: ${date}.\n\n`:''}Favor de confirmar la recepción de esta solicitud, disponibilidad y fecha de entrega.\n\nQuedamos atentos a sus comentarios.\n\nSaludos,\n${sender}\n${company}`};
}
export default function PurchaseEmailModal({draft,business,purchase,onChange,onClose,onSent}:{draft:PurchaseEmailDraft;business:string;purchase:string;onChange:(draft:PurchaseEmailDraft)=>void;onClose:()=>void;onSent:()=>void}) {
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [senders,setSenders]=useState<EmailSender[]>([]),[provider,setProvider]=useState<EmailProvider>('company'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const guard=useRef(false),initialProvider=useRef(draft.provider);const locked=busy||!!draft.result;
 useEffect(()=>{let active=true;fetch('/api/purchases/email').then(r=>r.json()).then(data=>{if(!active)return;setSenders(data.senders??[]);setProvider(data.senders?.some((s:EmailSender)=>s.provider===initialProvider.current)?initialProvider.current!:data.senders?.[0]?.provider??'company');if(data.error)setError(data.error);}).catch(()=>{if(active)setError('No se pudieron consultar tus correos. Cierra y vuelve a abrir el borrador.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 function close(){if(!guard.current)onClose();}
 async function send(){
  if(guard.current||loading||!senders.length||draft.result)return;
  guard.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(!await confirmAction('¿Estas seguro que quieres enviar el correo?','Enviar'))return;
   const requestId=draft.requestId??crypto.randomUUID();
   const pending:EmailOutcome={state:'sending',message:'Enviando correo…'};
   const snapshot={...draft,requestId,provider,result:pending};onChange(snapshot);
   const form=new FormData();for(const [key,value] of Object.entries({requestId,purchase,business,provider,sender:senders.find(s=>s.provider===provider)?.email??'',to:draft.to,cc:draft.cc,subject:draft.subject,body:draft.body}))form.set(key,value);
   draft.files.forEach(file=>form.append('files',file));
   try{
    const response=await fetch('/api/purchases/email',{method:'POST',body:form});const result=await response.json();
    if(result.error){setError(result.error);onChange({...snapshot,result:undefined});return;}
    onChange({...snapshot,result});if(result.state==='sent')onSent();
   }catch{onChange({...snapshot,result:{state:'unknown',message:'Se perdió la conexión. Consulta el resultado antes de repetir el envío.'}});}
  }finally{guard.current=false;setBusy(false);}
 }
 async function checkResult(){if(!draft.requestId||guard.current)return;guard.current=true;setBusy(true);try{const r=await fetch(`/api/purchases/email?requestId=${encodeURIComponent(draft.requestId)}`);const result=await r.json();if(result.error)setError(result.error);else {onChange({...draft,result});if(result.state==='sent')onSent();}}catch{setError('No se pudo consultar el resultado. Intenta nuevamente.');}finally{guard.current=false;setBusy(false);}}
 function attach(files:FileList|null){
  if(!files)return;
  const combined=[...draft.files];
  for(const file of Array.from(files))if(!combined.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified))combined.push(file);
  if(combined.length>10||combined.reduce((sum,f)=>sum+f.size,0)>20*1024*1024){setError('Puedes seleccionar hasta 10 archivos con un total de 20 MB.');return;}
  if(combined.some(f=>!f.size)){setError('No se pueden adjuntar archivos vacíos.');return;}
  setError('');onChange({...draft,files:combined});
 }
 async function copy(){try{await navigator.clipboard.writeText(`Para: ${draft.to}\n${draft.cc?`CC: ${draft.cc}\n`:''}Asunto: ${draft.subject}\n\n${draft.body}`);setNotice('Texto copiado. Los archivos adjuntos no se incluyen en la copia.');setError('');}catch{setError('No se pudo copiar. Puedes seleccionar y copiar el texto del mensaje.');}}
 return <CrudModal labelledBy="purchase-email-title" onRequestClose={close}>
  <form onSubmit={e=>{e.preventDefault();void send();}} aria-busy={busy}>
   <div className="crud-modal-heading"><h2 id="purchase-email-title">Preparar correo al proveedor</h2><button type="button" className="icon-button" aria-label="Cerrar correo" disabled={busy} onClick={close}><X size={20}/></button></div>
   <div className="crud-modal-body">
    <p className="purchase-email-info">Compra {draft.number}. El borrador y sus adjuntos son temporales. Los resultados del envío se registran en Bitácora.</p>
    {!loading&&!senders.length&&<p role="status">Para enviar, conecta y valida un correo empresarial o Google en Perfil.</p>}
    {busy&&<p role="status"><LoaderCircle className="email-spinner" size={18}/> Procesando correo…</p>}
    {draft.result&&<div className={draft.result.state==='sent'?'import-success':'purchase-email-info'} role="status"><strong>{draft.result.message}</strong>{!!draft.result.rejected?.length&&<p>Rechazados: {draft.result.rejected.join(', ')}</p>}{!!draft.result.accepted?.length&&<p>Aceptados: {draft.result.accepted.join(', ')}</p>}</div>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <fieldset className="product-fields" disabled={locked}><div className="product-form-grid">
     <label className="product-wide">Enviar desde<select value={provider} disabled={loading||!senders.length} onChange={e=>setProvider(e.target.value as EmailProvider)}>{!senders.length&&<option value="company">{loading?'Consultando correos…':'Sin correo validado'}</option>}{senders.map(s=><option key={s.provider} value={s.provider}>{s.provider==='company'?'Correo empresarial':'Google'} — {s.email}</option>)}</select></label>
     {!!draft.contacts.length&&<label className="product-wide">Contacto del proveedor<select value="" onChange={e=>{if(e.target.value)onChange({...draft,to:e.target.value});}}><option value="">Seleccionar contacto para destinatario</option>{draft.contacts.map((c,i)=><option key={i} value={c.email}>{c.name||'Contacto'} — {c.email}</option>)}</select></label>}
     <label>Para<input type="email" required multiple placeholder="correo@proveedor.com" value={draft.to} onChange={e=>onChange({...draft,to:e.target.value})}/></label>
     <label>CC (opcional)<input type="email" multiple placeholder="Separa los correos con comas" value={draft.cc} onChange={e=>onChange({...draft,cc:e.target.value})}/></label>
     <label className="product-wide">Asunto<input required value={draft.subject} maxLength={300} onChange={e=>onChange({...draft,subject:e.target.value})}/></label>
     <label className="product-wide">Mensaje<textarea required maxLength={50000} rows={13} value={draft.body} onChange={e=>onChange({...draft,body:e.target.value})}/></label>
     <label className="product-wide"><span><Paperclip size={16}/> Adjuntar OC en PDF u otros archivos</span><input type="file" multiple onChange={e=>{attach(e.target.files);e.target.value='';}}/><small>Hasta 10 archivos, 20 MB en total.</small></label>
    </div>
    <ul className="purchase-email-files">{draft.files.map((f,i)=><li key={`${f.name}-${f.lastModified}-${f.size}`}><span>{f.name}<small>{(f.size/1024).toLocaleString('es-MX',{maximumFractionDigits:1})} KB</small></span><button type="button" className="icon-button" aria-label={`Quitar adjunto ${f.name}`} onClick={()=>onChange({...draft,files:draft.files.filter((_,index)=>index!==i)})}><Trash2 size={17}/></button></li>)}</ul>
    </fieldset>
   </div>
   <div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={busy} onClick={()=>void copy()}><Copy size={16}/>Copiar correo</button><button type="button" className="client-secondary" disabled={busy} onClick={close}>Cerrar borrador</button>
    {(draft.result?.state==='sending'||draft.result?.state==='unknown')&&<button type="button" className="client-secondary" disabled={busy} onClick={()=>void checkResult()}>Consultar resultado</button>}
    {draft.result?.state==='failed'&&<button type="button" className="client-secondary" disabled={busy} onClick={()=>{setError('');onChange({...draft,result:undefined,requestId:crypto.randomUUID()});}}>Preparar nuevo intento</button>}
    <button type="submit" className="client-primary" disabled={busy||loading||!senders.length||!!draft.result}>{busy?<LoaderCircle className="email-spinner" size={16}/>:<Send size={16}/>} {busy?'Enviando…':'Enviar correo'}</button></div>
  </form>
 </CrudModal>;
}
