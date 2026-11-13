"use client";
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Mail,Unplug,X} from 'lucide-react';
import CrudModal from './crud-modal';
import {confirmAction} from '../lib/alerts';
import {validateCompanyEmail,disconnectCompanyEmail} from './company-email-actions';
import type {CompanyEmailStatus} from '../lib/company-email';
export default function CompanyEmailPanel({status}:{status:CompanyEmailStatus}){
 const router=useRouter();const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [pending,startTransition]=useTransition(),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function close(){if(!pending){setOpen(false);setPassword('');setError('');}}
 function save(){startTransition(async()=>{setError('');try{
  const result=await validateCompanyEmail(email,password);if(!result.ok){setError(result.error);return;}
  setPassword('');setOpen(false);setNotice('Correo validado y guardado. El servidor aceptó tus credenciales.');router.refresh();
 }catch{setError('No se pudo completar la validación. Intenta nuevamente.');}});}
 function disconnect(){startTransition(async()=>{setError('');try{
  if(!await confirmAction('¿Desconectar tu correo de empresa del ERP?'))return;
  const result=await disconnectCompanyEmail();if(!result.ok){setError(result.error);return;}
  setNotice('Correo de empresa desconectado.');router.refresh();
 }catch{setError('No se pudo desconectar el correo.');}});}
 return <section className="profile-card" aria-labelledby="company-email-title">
  <div className="profile-card-heading"><Mail size={22}/><h2 id="company-email-title">Correo de empresa</h2><span className={`profile-badge ${status.email?'connected':''}`}>{status.email?'Validado':'Sin conectar'}</span></div>
  <p>Conecta tu correo @pesaje.com.mx para usarlo en el envío de compras a proveedores.</p>
  {status.email&&<p className="profile-gmail-address"><strong>{status.email}</strong></p>}
  {status.validatedAt&&<p className="profile-muted">Última validación: {new Date(status.validatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})} (CDMX).</p>}
  <p className="profile-muted">La validación comprueba la conexión segura y la contraseña con el servidor. No envía un correo de prueba.</p>
  {status.error&&<p className="profile-notice" role="status">{status.error}</p>}{!open&&error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="import-success" role="status">{notice}</p>}
  <div className="profile-buttons"><button className="client-primary" disabled={pending||!status.ready} onClick={()=>{setEmail(status.email??'');setPassword('');setError('');setNotice('');setOpen(true);}}>{status.email?'Actualizar o volver a validar':'Conectar correo de empresa'}</button>{status.email&&<button className="client-secondary" disabled={pending} onClick={disconnect}><Unplug size={16}/>Desconectar</button>}</div>
  <p className="profile-muted">Tu acceso al ERP se conserva. Este correo se selecciona por defecto al preparar un envío en Compras.</p>
  {open&&<CrudModal labelledBy="company-email-form-title" onRequestClose={close}><form onSubmit={e=>{e.preventDefault();save();}}>
   <div className="crud-modal-heading"><h2 id="company-email-form-title">Conectar correo de empresa</h2><button type="button" className="icon-button" onClick={close} disabled={pending} aria-label="Cerrar"><X size={20}/></button></div>
   <div className="crud-modal-body">{error&&<p className="error" role="alert">{error}</p>}<fieldset className="product-fields" disabled={pending}><div className="product-form-grid">
    <label className="product-wide">Correo de empresa<input type="email" required maxLength={254} autoComplete="username" placeholder="admin@pesaje.com.mx" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="product-wide">Contraseña del correo<input type="password" required maxLength={512} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <p className="product-wide profile-muted">Servidor: mail.pesaje.com.mx · Puerto 465 · TLS. La contraseña se guarda cifrada y no se vuelve a mostrar.</p>
   </div></fieldset></div><div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={pending} onClick={close}>Cancelar</button><button className="client-primary" disabled={pending}>{pending?'Validando conexión…':'Validar y guardar'}</button></div>
  </form></CrudModal>}
 </section>;
}
