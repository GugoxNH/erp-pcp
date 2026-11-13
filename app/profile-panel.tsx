"use client";
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Mail,UserRound,Pencil,X,Link2,Unplug} from 'lucide-react';
import CrudModal from './crud-modal';
import {saveMyProfile,changeMyEmail,connectMyGmail,disconnectMyGmail} from './profile-actions';
import {confirmAction} from '../lib/alerts';
import CompanyEmailPanel from './company-email-panel';
import type {CompanyEmailStatus} from '../lib/company-email';

type Props={profile:{username:string;full_name:string;updated_at:string};email:string;pendingEmail:string;gmail:{email:string|null;connectedAt:string|null;ready:boolean;error:string};companyEmail:CompanyEmailStatus;outcome:string};
const outcomes:Record<string,string>={email_expired:'No se pudo verificar este enlace de correo. Revisa tu correo actual y el nuevo; si hace falta, solicita el cambio nuevamente.',connected:'Tu cuenta de Gmail quedó conectada.',cancelled:'Cancelaste la conexión. Tu cuenta anterior, si existe, se conserva.',expired:'La solicitud de conexión venció o ya se utilizó. Vuelve a intentarlo.',permission:'No se recibió la autorización necesaria. Vuelve a conectar y concede el permiso de envío.',failed:'No se pudo completar la conexión con Gmail. Intenta nuevamente.'};
export default function ProfilePanel({profile,email,pendingEmail,gmail,companyEmail,outcome}:Props){
 const router=useRouter();
 const [editing,setEditing]=useState<'profile'|'email'|null>(null);
 const [name,setName]=useState(profile.full_name),[username,setUsername]=useState(profile.username),[newEmail,setNewEmail]=useState(email);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,startTransition]=useTransition();
 function close(){if(!pending){setEditing(null);setError('');}}
 function edit(mode:'profile'|'email'){setError('');setNotice('');setName(profile.full_name);setUsername(profile.username);setNewEmail(email);setEditing(mode);}
 function save(){startTransition(async()=>{
  setError('');
  try{
   if(editing==='email'&&!await confirmAction(`¿Solicitar el cambio de tu correo de acceso a ${newEmail}?`))return;
   const result=editing==='profile'?await saveMyProfile(profile.updated_at,name,username):await changeMyEmail(newEmail);
   if(!result.ok){setError(result.error);return;}
   setEditing(null);setNotice(typeof result.value==='string'?result.value:'Datos guardados.');router.refresh();
  }catch{setError('No se pudo completar la operación. Intenta nuevamente.');}
 });}
 function connect(){startTransition(async()=>{setError('');try{const result=await connectMyGmail();if(!result.ok){setError(result.error);return;}window.location.assign(result.value);}catch{setError('No se pudo iniciar la conexión.');}});}
 function disconnect(){startTransition(async()=>{setError('');try{if(!await confirmAction('¿Desconectar tu Gmail del ERP?'))return;const result=await disconnectMyGmail();if(!result.ok){setError(result.error);return;}setNotice('Gmail desconectado del ERP.');router.replace('/perfil');router.refresh();}catch{setError('No se pudo desconectar Gmail.');}});}
 return <section className="products-workspace profile-workspace">
  <p className="eyebrow">MI CUENTA</p><h1>Perfil</h1><p className="profile-intro">Administra tus datos personales y tus cuentas de correo para compras.</p>
  {!editing&&error&&<p className="error" role="alert">{error}</p>}
  {notice&&<p className="import-success" role="status">{notice}</p>}
  {outcomes[outcome]&&!notice&&<p className={outcome==='connected'?'import-success':'profile-notice'} role="status">{outcomes[outcome]}</p>}
  <div className="profile-cards">
   <CompanyEmailPanel status={companyEmail}/>
   <section className="profile-card" aria-labelledby="profile-data"><div className="profile-card-heading"><UserRound size={22}/><h2 id="profile-data">Datos personales</h2><button className="client-secondary" disabled={pending} onClick={()=>edit('profile')}><Pencil size={16}/>Editar</button></div>
    <dl className="profile-details"><div><dt>Nombre completo</dt><dd>{profile.full_name}</dd></div><div><dt>Usuario</dt><dd>{profile.username}</dd></div><div><dt>Correo de acceso</dt><dd>{email||'Sin correo registrado'}</dd></div></dl>
    {pendingEmail&&<p role="status">Cambio pendiente de confirmar: {pendingEmail}</p>}
    <button className="client-secondary" disabled={pending} onClick={()=>edit('email')}>Cambiar correo de acceso</button>
   </section>
   <section className="profile-card" aria-labelledby="profile-gmail"><div className="profile-card-heading"><Mail size={22}/><h2 id="profile-gmail">Gmail</h2><span className={`profile-badge ${gmail.email?'connected':''}`}>{gmail.email?'Conectado':'Sin conectar'}</span></div>
    <p>Conecta tu cuenta personal para enviar correos a proveedores desde el ERP. Puede ser distinta de tu correo de acceso.</p>
    {gmail.email&&<p className="profile-gmail-address"><strong>{gmail.email}</strong></p>}
    <p className="profile-muted">Google te pedirá permiso para identificar tu cuenta y enviar correos. No se solicita acceso para leer tu bandeja de entrada.</p>
    {gmail.error&&<p className="profile-notice" role="status">{gmail.error}</p>}
    <div className="profile-buttons"><button className="client-primary" disabled={pending||!gmail.ready} onClick={connect}><Link2 size={17}/>{pending?'Espera…':gmail.email?'Cambiar o reconectar Gmail':'Conectar con Google'}</button>{gmail.email&&<button className="client-secondary" disabled={pending} onClick={disconnect}><Unplug size={17}/>Desconectar</button>}</div>
    {gmail.email&&<p className="profile-muted">También puedes retirar la autorización desde <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">las conexiones de tu cuenta de Google</a>.</p>}
    <p className="profile-muted">Selecciona esta cuenta al preparar un correo en Compras a proveedores.</p>
   </section>
  </div>
  {editing&&<CrudModal labelledBy="profile-edit-title" onRequestClose={close}><form onSubmit={e=>{e.preventDefault();save();}}>
   <div className="crud-modal-heading"><h2 id="profile-edit-title">{editing==='profile'?'Editar mis datos':'Cambiar correo de acceso'}</h2><button type="button" className="icon-button" disabled={pending} onClick={close} aria-label="Cerrar"><X size={20}/></button></div>
   <div className="crud-modal-body">{error&&<p className="error" role="alert">{error}</p>}<fieldset className="product-fields" disabled={pending}><div className="product-form-grid">
    {editing==='profile'?<><label className="product-wide">Nombre completo<input required maxLength={160} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label className="product-wide">Usuario<input required minLength={3} maxLength={40} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/><small>De 3 a 40 letras sin acentos, números, puntos o guiones.</small></label></>:<><label className="product-wide">Nuevo correo<input type="email" required maxLength={254} autoComplete="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><p className="product-wide">Este cambio afecta tu acceso al ERP. Revisa los mensajes de confirmación del correo actual y del nuevo. Tu Gmail conectado se conserva.</p></>}
   </div></fieldset></div><div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={pending} onClick={close}>Cancelar</button><button className="client-primary" disabled={pending}>{pending?'Guardando…':editing==='email'?'Solicitar cambio':'Guardar cambios'}</button></div>
  </form></CrudModal>}
 </section>;
}
