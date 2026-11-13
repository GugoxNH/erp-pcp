"use client";
import CrudModal from "../../crud-modal";
import {confirmAction} from "../../../lib/alerts";
import {useEffect,useState} from "react";
import {Eye,EyeOff,Pencil,Plus,RefreshCw,Save,Search,ShieldCheck,X} from "lucide-react";
import {permissions,hasPermission,sections,type UserAccount,type Section} from "../../../lib/access";
import {createUser,editUser,getUsers,updateUserEmail} from "../../user-actions";
import {useCompany} from "../../workspace-shell";
import "../../products.css";
import "../../users.css";

type Draft={edit_orders?:boolean;edit_users?:boolean;edit_warehouse?:boolean;username:string;full_name:string;email:string;sections:Section[];active:boolean;user_id?:string;updated_at?:string};
export default function UsersPage() {
  const [users,setUsers]=useState<UserAccount[]>([]),[self,setSelf]=useState(""),[configured,setConfigured]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [search,setSearch]=useState(""),[draft,setDraft]=useState<Draft|null>(null),[password,setPassword]=useState(""),[visible,setVisible]=useState(false);
  const {setProcessing,access}=useCompany();
  const canEdit=hasPermission(users.find(u=>u.user_id===self)??access,"edit_users");
  async function refresh() {
    setLoading(true);
    try { const r=await getUsers(); if(!r.ok) throw new Error(r.error); setUsers(r.value.users);setSelf(r.value.self);setConfigured(r.value.configured); }
    catch(e) {setError(e instanceof Error?e.message:"No se pudo conectar.");} finally {setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{setProcessing(busy||!!draft);return()=>setProcessing(false);},[busy,draft,setProcessing]);

  function close(){if(busy)return;setDraft(null);setPassword("");setVisible(false);setError("");}
  async function saveEmail(){
    if(!draft?.user_id || !await confirmAction("¿Actualizar el correo de inicio de sesión y recuperación de esta cuenta?")) return;
    setBusy(true);setError("");
    try{
      const r=await updateUserEmail(draft.user_id,draft.updated_at!,users.find(u=>u.user_id===draft.user_id)?.email ?? "",draft.email);
      if(!r.ok) throw new Error(r.error);
      setUsers(old=>old.map(u=>u.user_id===draft.user_id?{...u,email:r.value}:u));
      setDraft({...draft,email:r.value});setNotice("Correo actualizado.");
    }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar el correo.");}finally{setBusy(false);}
  }
  async function save(){
    if(!draft)return;setBusy(true);setError("");
    try{
      if(draft.user_id && draft.email!==(users.find(u=>u.user_id===draft.user_id)?.email ?? "")) throw new Error("Pulsa Actualizar correo para confirmar ese cambio antes de guardar el resto.");
      const r=draft.user_id?await editUser(draft.user_id,draft.updated_at!,draft):await createUser(draft,password);
      if(!r.ok)throw new Error(r.error);
      setDraft(null);setPassword("");setVisible(false);setNotice("Usuario guardado.");await refresh();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}finally{setBusy(false);}
  }
  const filtered=users.filter(u=>`${u.username} ${u.full_name} ${u.email}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
  return <section className="products-workspace users-workspace">
    <div className="companies-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios</h1></div><button className="client-primary" disabled={loading||!configured||!canEdit} onClick={()=>{setError("");setNotice("");setDraft({username:"",full_name:"",email:"",sections:[],active:true});}}><Plus size={18}/>Nuevo usuario</button></div>
    {!loading&&!configured&&<p role="alert" className="error">Falta configurar SUPABASE_SECRET_KEY en el servidor para crear usuarios.</p>}
    {error&&!draft&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="products-toolbar"><label className="products-search"><Search size={18}/><input aria-label="Buscar usuarios" placeholder="Buscar usuario, nombre o correo" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="icon-button" aria-label="Actualizar usuarios" title="Actualizar usuarios" disabled={loading} onClick={()=>{setError("");void refresh();}}><RefreshCw size={18}/></button></div>
    <div className="products-table"><table><thead><tr><th>Usuario / nombre</th><th>Correo electrónico</th><th>Accesos</th><th>Permisos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{!loading&&filtered.map(u=><tr key={u.user_id}><td><strong>{u.username}</strong><span>{u.full_name}</span>{u.is_developer&&<small className="user-developer"><ShieldCheck size={14}/>Desarrollador</small>}</td><td>{u.email || "Sin correo registrado"}</td><td><div className="user-access-list">{sections.filter(s=>u.is_developer||u.sections.includes(s.id)).map(s=><span key={s.id}>{s.label}</span>)}</div></td><td><div className="user-access-list">{permissions.filter(p=>u.is_developer||u[p.id]).map(p=><span key={p.id}>{p.label}</span>)}{!u.is_developer&&!permissions.some(p=>u[p.id])&&<span>Sin permisos</span>}</div></td><td>{u.active?"Activo":"Inactivo"}</td><td><button className="icon-button" disabled={!canEdit||u.is_developer||u.user_id===self} title={!canEdit?"Requiere Edición de usuarios":u.is_developer||u.user_id===self?"Cuenta protegida":`Editar ${u.username}`} aria-label={`Editar ${u.username}`} onClick={()=>{setError("");setDraft({...u});}}><Pencil size={17}/></button></td></tr>)}</tbody></table></div>
    {(loading||!filtered.length)&&<div className="products-empty"><ShieldCheck size={30}/><p>{loading?"Cargando usuarios…":"No hay usuarios que coincidan"}</p></div>}
    <div className="products-pagination"><span>{filtered.length} usuarios</span></div>
    <CrudModal open={!!draft} className="product-dialog" labelledBy="user-title" onRequestClose={close}><form onSubmit={e=>{e.preventDefault();void save();}}>
      <div className="product-dialog-heading"><h2 id="user-title">{draft?.user_id?"Editar usuario":"Nuevo usuario"}</h2><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar formulario" disabled={busy} onClick={close}><X size={20}/></button></div>
      <div className="crud-modal-body">
      {error&&<p role="alert" className="error">{error}</p>}
      {draft&&<fieldset className="product-fields" disabled={busy}><div className="product-form-grid">
        <label className="product-wide">Nombre de usuario<input required autoComplete="off" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" minLength={3} maxLength={40} disabled={!!draft.user_id} value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label>
        <label className="product-wide">Nombre completo<input required maxLength={160} autoComplete="off" value={draft.full_name} onChange={e=>setDraft({...draft,full_name:e.target.value})}/></label>
        <label className="product-wide">Correo electrónico<input type="email" required={!draft.user_id} maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label>
        {draft.user_id&&<button type="button" className="client-secondary" disabled={busy||draft.email===(users.find(u=>u.user_id===draft.user_id)?.email ?? "")} onClick={()=>void saveEmail()}><Save size={16}/>Actualizar correo</button>}
        {!draft.user_id&&<label className="product-wide">Contraseña<div className="user-password"><input required type={visible?"text":"password"} minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="icon-button" aria-label={visible?"Ocultar contraseña":"Mostrar contraseña"} title={visible?"Ocultar contraseña":"Mostrar contraseña"} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><small>Mínimo 12 caracteres</small></label>}
        <fieldset className="user-permissions product-wide"><legend>Accesos</legend><label className="user-check user-all"><input type="checkbox" checked={draft.sections.length===sections.length} onChange={e=>setDraft({...draft,sections:e.target.checked?sections.map(s=>s.id):[]})}/>Todos los accesos</label><div className="user-permissions-grid">{sections.map(s=><label className="user-check" key={s.id}><input type="checkbox" checked={draft.sections.includes(s.id)} onChange={e=>setDraft({...draft,sections:e.target.checked?[...draft.sections,s.id]:draft.sections.filter(v=>v!==s.id)})}/>{s.label}</label>)}</div></fieldset>
        <fieldset className="user-permissions product-wide"><legend>Permisos</legend><div className="user-permissions-grid">{permissions.map(p=><label className="user-check" key={p.id}><input type="checkbox" checked={draft[p.id]===true} onChange={e=>setDraft({...draft,[p.id]:e.target.checked})}/>{p.label}</label>)}</div><small>Cada permiso requiere el acceso a su sección. Edición de usuarios permite crear y modificar cuentas, accesos y permisos. El desarrollador tiene todos los permisos.</small></fieldset>
        {draft.user_id&&<label className="user-check product-wide"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Usuario activo</label>}
      </div></fieldset>}
      </div>
      <div className="product-dialog-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>Cancelar</button><button className="client-primary" disabled={busy||!canEdit||!draft?.sections.length}><Save size={17}/>{busy?"Guardando…":"Guardar usuario"}</button></div>
    </form></CrudModal>
  </section>;
}
