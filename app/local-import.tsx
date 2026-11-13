"use client";
import CrudModal from "./crud-modal";

import { useEffect, useRef, useState } from "react";
import { Database, Download, Upload, X } from "lucide-react";
import { captureBackup, downloadBackup, snapshotFromBackup, type LocalBackup } from "../lib/local-backup";
import { type ImportReport, type LocalSnapshot, unwrap } from "../lib/catalog-model";
import { importCatalog } from "./catalog-actions";
import { useCatalog } from "./catalog-provider";
import { useCompany } from "./workspace-shell";
import { canAccess } from "../lib/access";

export default function LocalImport() {
  const [open, setOpen] = useState(false);
  const {access}=useCompany();
  if(!canAccess(access,"clients") || !canAccess(access,"businesses")) return null;
  return <><div className="catalog-import-bar"><span><Database size={16}/>Supabase</span><button className="client-secondary" onClick={() => setOpen(true)}><Upload size={16}/>Importar datos locales</button></div>{open && <ImportDialog onClose={() => setOpen(false)} />}</>;
}
function ImportDialog({ onClose }: { onClose: () => void }) {
  
  const file = useRef<HTMLInputElement>(null);
  const { changed } = useCatalog();
  const [backup, setBackup] = useState<LocalBackup | null>(null);
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  function prepare(value: LocalBackup) {
    setBackup(value); setSnapshot(null); setDownloaded(false); setConfirmed(false); setReport(null); setError("");
    try { setSnapshot(snapshotFromBackup(value)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo interpretar el respaldo."); }
  }
  function loadBrowser() {
    try { prepare(captureBackup()); }
    catch { setBackup(null); setSnapshot(null); setError("No se puede leer el almacenamiento de este navegador."); }
  }
  useEffect(() => { loadBrowser(); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (busy) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function importData() {
    if (!snapshot || !confirmed || !downloaded || busy) return;
    setBusy(true); setError("");
    try {
      if (new Blob([JSON.stringify(snapshot)]).size > 800000) throw new Error("El respaldo supera el tamaño permitido para esta importación.");
      const imported = unwrap(await importCatalog(snapshot));
      setReport(imported); await changed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo confirmar la importación. Puedes reintentar; no se duplicarán los registros."); }
    finally { setBusy(false); }
  }
  return <CrudModal className="client-dialog import-dialog" labelledBy="import-title" onRequestClose={() => { if (!busy) onClose(); }}>
    <div className="client-dialog-heading"><h2 id="import-title">Importar datos locales</h2><button className="icon-button" title="Cerrar" aria-label="Cerrar importación" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <div className="import-body">
      <div className="import-sources"><button className="client-secondary" disabled={busy} onClick={loadBrowser}>Este navegador</button><button className="client-secondary" disabled={busy} onClick={() => file.current?.click()}><Upload size={16}/>Abrir respaldo</button><input ref={file} hidden type="file" accept=".json,application/json" onChange={async event => {
        const selected = event.target.files?.[0]; event.target.value = "";
        if (!selected) return;
        setBackup(null); setSnapshot(null); setReport(null); setDownloaded(false); setConfirmed(false);
        try { if (selected.size > 5000000) throw new Error("El archivo es demasiado grande."); prepare(JSON.parse(await selected.text())); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el respaldo."); }
      }}/></div>
      <p>Se conservarán los datos de este navegador. La importación agrega registros y asociaciones; no reemplaza datos diferentes que ya existan en Supabase.</p>
      {snapshot && <dl className="import-counts"><div><dt>Clientes</dt><dd>{snapshot.clients.length}</dd></div><div><dt>Razones sociales con datos locales</dt><dd>{snapshot.businesses.length}</dd></div><div><dt>Asociaciones</dt><dd>{snapshot.businesses.reduce((sum, b) => sum + b.details.clients.length, 0)}</dd></div></dl>}
      {backup?.rawStorage?.["warehouse.clients.v1"] === null && <p className="notice">No hay un catálogo guardado en este navegador. Se incluirá el catálogo inicial del proyecto, sin inventar asociaciones. Si capturaste datos en otra dirección o navegador, abre el respaldo de ese origen.</p>}
      <button className="client-secondary" disabled={!backup || busy} onClick={() => {
        try { downloadBackup(backup!); setDownloaded(true); } catch { setError("No se pudo descargar el respaldo."); }
      }}><Download size={17}/>Descargar respaldo previo</button>
      <label className="import-confirm"><input type="checkbox" checked={confirmed} disabled={!downloaded || busy} onChange={event => setConfirmed(event.target.checked)}/>Confirmo que guardé el respaldo y deseo importar estos datos.</label>
      {error && <p className="error" role="alert">{error}</p>}
      {report && <p className="import-success" role="status">Importación confirmada: {report.clients} clientes nuevos, {report.businesses} razones sociales actualizadas y {report.links} asociaciones nuevas. Los registros idénticos se conservaron sin duplicar.</p>}
    </div>
    <div className="client-dialog-footer"><div><button className="client-secondary" disabled={busy} onClick={onClose}>Cerrar</button><button className="client-primary" disabled={busy || !snapshot || !confirmed || !downloaded || !!report} onClick={importData}><Database size={17}/>{busy ? "Importando..." : "Importar a Supabase"}</button></div></div>
  </CrudModal>;
}
