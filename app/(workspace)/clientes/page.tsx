"use client";
import CrudModal from "../../crud-modal";
import {alerts,confirmAction,showActionError} from "../../../lib/alerts";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Save, Search, Trash2, Users, X } from "lucide-react";
import { blankClient, normalizeClientName, type Client } from "../../../lib/clients";
import { saveClient, deleteClient } from "../../catalog-actions";
import { unwrap } from "../../../lib/catalog-model";
import { businesses as businessLabels } from "../../../lib/businesses";
import LocalImport from "../../local-import";
import { useClients } from "../../use-clients";
import type { ClientContact } from "../../../lib/client-contacts";

const PAGE_SIZE = 12;

export default function ClientsPage() {
  const { clients, ready, error } = useClients();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ client: Client | null } | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [notice, setNotice] = useState("");
  const query = normalizeClientName(search);
  const filtered = clients.filter(client => (status === "all" || client.active === (status === "active")) && normalizeClientName(`${client.name} ${client.legalName} ${client.rfc} ${client.city} ${client.contacts.map(c => `${c.name} ${c.area} ${c.email} ${c.phone}`).join(" ")}`).includes(query)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <div className="companies-workspace client-workspace">
    <div className="companies-heading"><div><p className="eyebrow">CATÁLOGOS</p><h1>Clientes</h1></div><button className="client-primary" disabled={!ready} onClick={() => { setNotice(""); setEditor({ client: null }); }}><Plus size={18}/>Nuevo cliente</button></div>
    <LocalImport />
    <div className="client-summary"><Users size={18}/><strong>{clients.length}</strong> clientes <span>{clients.filter(client => client.active).length} activos</span></div>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="catalog-notice" role="status">{notice}</p>
    <div className="clients-toolbar catalog-toolbar"><label className="client-search"><Search size={18}/><input aria-label="Buscar clientes" type="search" placeholder="Nombre, RFC o contacto" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><label className="catalog-filter">Estado<select aria-label="Filtrar por estado" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></div>
    <div className="client-table-scroll"><table className="client-table"><caption className="sr-only">Catálogo de clientes</caption><thead><tr><th>Cliente</th><th>RFC</th><th>Contacto</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
      {visible.map(client => <tr key={client.id}><td><button className="client-name" onClick={() => setEditor({ client })}>{client.name}</button><small>{client.legalName || "Razón social pendiente"}</small></td><td>{client.rfc || "—"}</td><td><span>{client.contacts[0]?.name || "—"}</span><small>{client.contacts[0]?.email || client.contacts[0]?.phone}</small>{client.contacts.length > 1 && <small>+{client.contacts.length - 1} contactos</small>}</td><td><span className={`client-status ${client.active ? "active" : "inactive"}`}>{client.active ? "Activo" : "Inactivo"}</span></td><td><div className="client-actions"><button className="icon-button" title={`Editar ${client.name}`} aria-label={`Editar ${client.name}`} disabled={!ready} onClick={() => setEditor({ client })}><Pencil size={17}/></button><button className="icon-button delete-action" title={`Eliminar ${client.name}`} aria-label={`Eliminar ${client.name}`} disabled={!ready} onClick={() => setDeleting(client)}><Trash2 size={17}/></button></div></td></tr>)}
    </tbody></table></div>
    {!visible.length && <div className="catalog-empty"><Users size={28}/><h2>{!ready ? "Catálogo no disponible" : search || status !== "all" ? "No se encontraron clientes" : "Sin clientes registrados"}</h2></div>}
    <div className="catalog-pagination"><span>{filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}</span><div><button className="icon-button" title="Página anterior" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18}/></button><span>{currentPage} / {pages}</span><button className="icon-button" title="Página siguiente" aria-label="Página siguiente" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18}/></button></div></div>
    {editor && <ClientEditor original={editor.client} onClose={() => setEditor(null)} onSaved={client => { setEditor(null); setNotice(`${client.name}: guardado en Supabase.`); }}/ >}
    {deleting && <DeleteClientDialog client={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setNotice(`${deleting.name}: cliente eliminado.`); setDeleting(null); }}/ >}
  </div>;
}

function ClientEditor({ original, onClose, onSaved }: { original: Client | null; onClose: () => void; onSaved: (client: Client) => void }) {
  const { changed } = useClients();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Client>(() => original ? { ...original } : blankClient());
  const [error, setError] = useState("");
  
  const addedContact = useRef<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original || blankClient());

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function close() {
    if (busy) return;
    if (!dirty || await confirmAction("¿Descartar los cambios sin guardar?")) onClose();
  }
  function addContact() {
    const contact: ClientContact = { id: crypto.randomUUID(), name: "", area: "", email: "", phone: "", mobile: "", observations: "" };
    addedContact.current = contact.id;
    setDraft(old => ({ ...old, contacts: [...old.contacts, contact] }));
  }
  function updateContact(id: string, key: keyof Omit<ClientContact, "id">, value: string) {
    setDraft(old => ({ ...old, contacts: old.contacts.map(contact => contact.id === id ? { ...contact, [key]: value } : contact) }));
  }
  async function removeContact(contact: ClientContact) {
    if ([contact.name,contact.area,contact.email,contact.phone,contact.mobile,contact.observations].some(Boolean) && !await confirmAction("¿Quitar este contacto del cliente? El cambio se aplicará al guardar.")) return;
    setDraft(old => ({ ...old, contacts: old.contacts.filter(item => item.id !== contact.id) }));
  }
  function field(key: keyof Pick<Client, "name" | "legalName" | "rfc" | "contact" | "email" | "phone" | "street" | "exterior" | "interior" | "neighborhood" | "city" | "state" | "postalCode" | "country">, label: string, options: { required?: boolean; type?: string; maxLength?: number; wide?: boolean } = {}) {
    return <label className={`business-field ${options.wide ? "field-wide" : ""}`} htmlFor={`client-${key}`}><span>{label}{options.required ? " *" : ""}</span><input id={`client-${key}`} required={options.required} type={options.type || "text"} maxLength={options.maxLength || 180} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: key === "rfc" ? event.target.value.toUpperCase() : event.target.value })}/></label>;
  }
  return <CrudModal className="client-dialog client-editor-dialog" labelledBy="client-editor-title" onRequestClose={() => { close(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); setError("");
      if (busy) return;
      if (draft.rfc.trim() && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(draft.rfc.trim())) { setError("El RFC debe tener 12 o 13 caracteres con un formato válido."); return; }
      setBusy(true);
      try { const saved = unwrap(await saveClient(draft, original)); await changed(); onSaved(saved); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el cliente en Supabase."); }
      finally { setBusy(false); }
    }}>
      <div className="client-dialog-heading"><h2 id="client-editor-title">{original ? "Editar cliente" : "Nuevo cliente"}</h2><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar formulario" onClick={close}><X size={20}/></button></div>
      <div className="client-editor-scroll">
      <fieldset className="business-fieldset" disabled={busy}>
        <section className="business-section"><h3>Datos generales</h3><div className="business-fields">
          {field("name", "Nombre comercial o cliente", { required: true, wide: true })}
          {field("legalName", "Nombre o razón social", { wide: true })}
          <label className="business-field" htmlFor="client-personType"><span>Tipo de persona</span><select id="client-personType" value={draft.personType} onChange={event => setDraft({ ...draft, personType: event.target.value as Client["personType"] })}><option value="">Sin especificar</option><option value="moral">Persona moral</option><option value="fisica">Persona física</option></select></label>
          {field("rfc", "RFC", { maxLength: 13 })}
          <label className="assigned-filter"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })}/>Cliente activo</label>
        </div></section>
        <section className="business-section"><h3>Domicilio fiscal</h3><div className="business-fields">{field("street", "Calle", { wide: true })}{field("exterior", "Número exterior", { maxLength: 20 })}{field("interior", "Número interior", { maxLength: 20 })}{field("neighborhood", "Colonia")}{field("postalCode", "Código postal", { maxLength: 12 })}{field("city", "Municipio o ciudad")}{field("state", "Estado")}{field("country", "País")}</div></section>
        <section className="business-section"><label className="business-field" htmlFor="client-notes"><span>Notas</span><textarea id="client-notes" rows={3} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label></section>
        <section className="business-section client-contacts" aria-labelledby="client-contacts-title">
          <h3 id="client-contacts-title">Contactos ({draft.contacts.length})</h3>
          {draft.contacts.length === 0 && <p className="client-contacts-empty">Sin contactos registrados</p>}
          {draft.contacts.map((contact,index) => <div className="client-contact-row" key={contact.id}>
            <div className="client-contact-heading"><h4>Contacto {index + 1}</h4><button type="button" className="icon-button delete-action" aria-label={`Quitar contacto ${index + 1}`} title="Quitar contacto" onClick={() => removeContact(contact)}><Trash2 size={17}/></button></div>
            <div className="business-fields">
              <label className="business-field"><span>Persona de contacto</span><input aria-label={`Persona de contacto ${index + 1}`} maxLength={500} value={contact.name} ref={node => { if(node && addedContact.current === contact.id) { addedContact.current = null; node.focus(); } }} onChange={e => updateContact(contact.id,"name",e.target.value)}/></label>
              <label className="business-field"><span>Área del contacto</span><input aria-label={`Área del contacto ${index + 1}`} maxLength={500} value={contact.area} onChange={e => updateContact(contact.id,"area",e.target.value)}/></label>
              <label className="business-field"><span>Correo electrónico</span><input aria-label={`Correo electrónico del contacto ${index + 1}`} type="email" maxLength={500} value={contact.email} onChange={e => updateContact(contact.id,"email",e.target.value)}/></label>
              <label className="business-field"><span>Teléfono fijo</span><input aria-label={`Teléfono fijo del contacto ${index + 1}`} type="tel" maxLength={500} value={contact.phone} onChange={e => updateContact(contact.id,"phone",e.target.value)}/></label>
              <label className="business-field"><span>Teléfono celular</span><input aria-label={`Teléfono celular del contacto ${index + 1}`} type="tel" maxLength={500} value={contact.mobile} onChange={e => updateContact(contact.id,"mobile",e.target.value)}/></label>
              <label className="business-field field-wide"><span>Observaciones</span><textarea aria-label={`Observaciones del contacto ${index + 1}`} rows={3} maxLength={2000} value={contact.observations} onChange={e => updateContact(contact.id,"observations",e.target.value)}/></label>
            </div>
          </div>)}
          <button type="button" className="client-secondary" onClick={addContact}><Plus size={17}/>Agregar contacto</button>
        </section>
      </fieldset>
      </div>
      <div className="client-dialog-footer">{error && <p className="error" role="alert">{error}</p>}<div><button type="button" className="client-secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="client-primary" disabled={busy}><Save size={17}/>{busy ? "Guardando..." : "Guardar cliente"}</button></div></div>
    </form>
  </CrudModal>;
}

function DeleteClientDialog({ client, onClose, onDeleted }: { client: Client; onClose: () => void; onDeleted: () => void }) {
  const { businesses, ready: checked, changed } = useClients();
  const callbacks = useRef({onClose,onDeleted,changed});
  callbacks.current = {onClose,onDeleted,changed};
  const linked = businesses.filter(b => b.details.clients.includes(client.id)).map(b => businessLabels.find(item => item.id === b.id)?.name ?? b.id).join(", ");
  useEffect(() => {
    let disposed=false;
    void alerts.fire({
      titleText: `¿Eliminar a ${client.name} del catálogo?`,
      text: !checked ? "No se pudo verificar el catálogo. Intenta nuevamente." : linked ? `Asociado a: ${linked}. Desvincúlalo primero en Mis empresas o cambia su estado a inactivo.` : "Esta acción no se puede deshacer.",
      icon: "warning", showCancelButton:true, showConfirmButton:checked&&!linked,
      confirmButtonText:"Eliminar cliente", focusCancel:true, showLoaderOnConfirm:true,
      allowOutsideClick:()=>!alerts.isLoading(), allowEscapeKey:()=>!alerts.isLoading(),
      preConfirm:async()=>{
        try { unwrap(await deleteClient(client)); return true; }
        catch(cause){showActionError(cause);return false;}
      },
    }).then(async result=>{
      if(disposed)return;
      if(result.isConfirmed){callbacks.current.onDeleted();await callbacks.current.changed();}
      else callbacks.current.onClose();
    });
    return ()=>{disposed=true;alerts.close();};
  }, [client,checked,linked]);
  return null;
}
