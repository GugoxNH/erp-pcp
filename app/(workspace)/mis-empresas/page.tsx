"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Save, Search, Users } from "lucide-react";
import { businesses, emptyBusinessDetails, type Business, type BusinessDetails } from "../../../lib/businesses";
import { saveBusiness, setAssociation } from "../../catalog-actions";
import { unwrap } from "../../../lib/catalog-model";
import { isClientAssigned } from "../../../lib/clients";
import { useClients } from "../../use-clients";
import { useCompany } from "../../workspace-shell";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function CompaniesPage() {
  const { company } = useCompany();
  const [selected, setSelected] = useState<Business>(company);
  const [editing, setEditing] = useState(false);
  return <div className="companies-workspace">
    <div className="companies-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Mis empresas</h1></div><span className="company-count">3 razones sociales</span></div>
    <div className="business-picker" aria-label="Razones sociales">
      {businesses.map(business => <button key={business.id} disabled={editing} className={`business-tile ${selected.id === business.id ? "is-selected" : ""}`} aria-pressed={selected.id === business.id} onClick={() => setSelected(business)}>
        <span className="business-tile-logo"><img src={business.logo} alt="" width={180} height={60}/></span>
        <span className="business-tile-label">{business.name}{selected.id === business.id && <Check size={18} aria-hidden="true"/>}</span>
      </button>)}
    </div>
    <BusinessEditor key={selected.id} business={selected} onEditing={setEditing}/>
  </div>;
}

function BusinessEditor({ business, onEditing }: { business: Business; onEditing: (value: boolean) => void }) {
  const { clients, businesses: records, ready: clientsReady, error: clientsError, changed } = useClients();
  const { setProcessing } = useCompany();
  const remote = records.find(row => row.id === business.id);
  const [details, setDetails] = useState<BusinessDetails>(emptyBusinessDetails);
  const [version, setVersion] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!remote;
  const [storageError, setStorageError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"general" | "clients">("general");
  const [search, setSearch] = useState("");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  useEffect(() => {
    if (remote && !dirty && !busy) { setDetails(remote.details); setVersion(remote.updatedAt); }
  }, [remote, dirty, busy]);
  useEffect(() => {
    onEditing(dirty || busy); setProcessing(dirty || busy);
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); onEditing(false); setProcessing(false); };
  }, [dirty, busy, onEditing, setProcessing]);

  function update(next: BusinessDetails) {
    setDetails(next); setDirty(true); setSaved(false);
  }
  async function save() {
    setBusy(true); setStorageError("");
    try { unwrap(await saveBusiness(business.id, details, version)); await changed(); setDirty(false); setSaved(true); }
    catch (cause) { setStorageError(cause instanceof Error ? cause.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function assign(clientId: string, value: boolean) {
    setBusy(true); setStorageError("");
    try { unwrap(await setAssociation(business.id, clientId, value)); await changed(); setSaved(true); }
    catch (cause) { setStorageError(cause instanceof Error ? cause.message : "No se pudo guardar la asociación."); }
    finally { setBusy(false); }
  }

  function field(key: Exclude<keyof BusinessDetails, "clients">, label: string, options: { type?: string; maxLength?: number; wide?: boolean } = {}) {
    return <label className={options.wide ? "business-field field-wide" : "business-field"} htmlFor={`business-${key}`}><span>{label}</span>
      <input id={`business-${key}`} type={options.type || "text"} maxLength={options.maxLength || 180} value={details[key]} onChange={event => update({ ...details, [key]: key === "rfc" ? event.target.value.toUpperCase() : event.target.value })}/>
    </label>;
  }

  const assignments = remote?.details.clients ?? [];
  const assignedClients = clients.filter(client => isClientAssigned(client, assignments));
  const visibleClients = [...clients].sort((a, b) => a.name.localeCompare(b.name, "es")).filter(client => normalize(client.name).includes(normalize(search.trim())) && (!onlyAssigned || isClientAssigned(client, assignments)));
  return <section className="business-editor" aria-label={`Información de ${business.name}`}>
    <div className="business-editor-heading"><h2>{business.name}</h2><span className="save-state" role="status">{busy ? "Guardando..." : dirty ? "Cambios sin guardar" : saved && !storageError ? <><Check size={14}/>Guardado en Supabase</> : ""}</span></div>
    {dirty && <div className="catalog-save-actions"><button className="client-secondary" disabled={busy} onClick={() => { setDirty(false); setStorageError(""); }}>Descartar cambios</button><button className="client-primary" disabled={busy || !clientsReady} onClick={save}><Save size={17}/>Guardar cambios</button></div>}
    {(storageError || clientsError) && <p role="alert" className="error">{storageError || clientsError}</p>}
    <div className="business-tabs" role="tablist" aria-label="Información de la empresa" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "general" : event.key === "End" ? "clients" : tab === "general" ? "clients" : "general";
      setTab(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
    }}>
      <button id="general-tab" role="tab" tabIndex={tab === "general" ? 0 : -1} aria-selected={tab === "general"} aria-controls="general-panel" onClick={() => setTab("general")}><Building2 size={17}/>Datos generales</button>
      <button id="clients-tab" role="tab" tabIndex={tab === "clients" ? 0 : -1} aria-selected={tab === "clients"} aria-controls="clients-panel" onClick={() => setTab("clients")}><Users size={17}/>Clientes asociados <span className="client-count">{assignedClients.length}</span></button>
    </div>
    <fieldset disabled={!ready || !clientsReady || busy} className="business-fieldset">
      {tab === "general" ? <div id="general-panel" role="tabpanel" aria-labelledby="general-tab">
        <section className="business-section"><h3>Identificación</h3><div className="business-fields">
          {field("legalName", "Nombre o razón social", { wide: true })}
          <label className="business-field" htmlFor="business-personType"><span>Tipo de persona</span><select id="business-personType" value={details.personType} onChange={event => update({ ...details, personType: event.target.value })}><option value="">Sin especificar</option><option value="moral">Persona moral</option><option value="fisica">Persona física</option></select></label>
          {field("rfc", "RFC", { maxLength: 13 })}
        </div></section>
        <section className="business-section"><h3>Contacto</h3><div className="business-fields">{field("contact", "Persona de contacto", { wide: true })}{field("email", "Correo electrónico", { type: "email" })}{field("phone", "Teléfono", { type: "tel", maxLength: 30 })}</div></section>
        <section className="business-section"><h3>Domicilio</h3><div className="business-fields">{field("street", "Calle", { wide: true })}{field("exterior", "Número exterior", { maxLength: 20 })}{field("interior", "Número interior", { maxLength: 20 })}{field("neighborhood", "Colonia")}{field("postalCode", "Código postal", { maxLength: 12 })}{field("city", "Municipio o ciudad")}{field("state", "Estado")}{field("country", "País")}</div></section>
        <section className="business-section"><label className="business-field" htmlFor="business-notes"><span>Notas</span><textarea id="business-notes" rows={3} maxLength={2000} value={details.notes} onChange={event => update({ ...details, notes: event.target.value })}/></label></section>
      </div> : <div id="clients-panel" role="tabpanel" aria-labelledby="clients-tab">
        <div className="clients-toolbar"><label className="client-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Buscar cliente" placeholder="Buscar cliente" value={search} onChange={event => setSearch(event.target.value)}/></label><label className="assigned-filter"><input type="checkbox" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)}/>Solo asociados</label></div>
        <div className="clients-list-heading"><span>Cliente</span><span>{assignedClients.length} asociados · {visibleClients.length} visibles</span></div>
        <div className="clients-list">{visibleClients.map(client => <label key={client.id} className={`client-row ${isClientAssigned(client, assignments) ? "is-assigned" : ""}`}><input type="checkbox" disabled={dirty} checked={isClientAssigned(client, assignments)} onChange={event => { void assign(client.id, event.target.checked); }}/><span>{client.name}{!client.active && " · Inactivo"}</span></label>)}</div>
        {!visibleClients.length && <p className="clients-empty">{search ? "No se encontraron clientes." : "No hay clientes asociados."}</p>}
      </div>}
    </fieldset>
  </section>;
}
