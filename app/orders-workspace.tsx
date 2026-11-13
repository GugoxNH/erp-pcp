"use client";
import {hasPermission} from "../lib/access";
import {deliveryIndicator,orderIndicator} from "../lib/order-indicators";
import OrderPurchases from "./order-purchases";
import "./products.css";
import {alerts,confirmAction} from "../lib/alerts";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, Save, ScanLine, Search, Trash2, Pencil } from "lucide-react";
import { useCompany } from "./workspace-shell";
import { useClients } from "./use-clients";
import { unwrap } from "../lib/catalog-model";
import { blankItem, blankOrder, orderReviewWarnings, draftFromExtraction, fulfillmentLabel, localDate, statusLabels, totals, validateOrder, type PurchaseOrderDraft, type SavedOrder, type OrderEvent, type OrderSummary } from "../lib/purchase-orders";
import { getOrder, listOrders, saveOrder } from "./order-actions";
import {orderProductOptions} from "./order-actions";
import {missingOrderProducts,type OrderProduct} from "../lib/order-products";
import OrderProductDialog from "./order-product-dialog";
import { orderActor, orderChanges } from "../lib/order-history";
import HtmlPreview from "./html-preview";
import {consignmentCompany,readHtmlFile,parseConsignmentHtml,extractConsignment} from "../lib/consignment-html";
import OrderSubitems from "./order-subitems";
import {inheritedCode} from "../lib/order-subitems";
import DeleteOrderButton from "./delete-order-button";
import PdfPreview from "./pdf-preview";
import OrderDateInput from "./order-date-input";
import { readOrderPdf } from "../lib/read-order-pdf";
import "./orders.css";

function money(value: string | number, currency: string) { return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value)); }
function displayDate(value: string) { return value ? value.split("-").reverse().join("/") : "Sin definir"; }

export default function OrdersWorkspace() {
  const { company, setProcessing, access } = useCompany();
  const catalog = useClients();
  const [mode, setMode] = useState<"list" | "edit" | "detail">("list");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [reading, setReading] = useState(false);
  const [readStatus, setReadStatus] = useState("");
  useEffect(() => {
    if (!reading) return;
    void alerts.fire({titleText:"Cargando y leyendo archivo", text:"Preparando documento…",
      showConfirmButton:false,allowOutsideClick:false,allowEscapeKey:false,
      didOpen:()=>alerts.showLoading()});
    return () => { alerts.close(); };
  }, [reading]);
  useEffect(()=>{
    if(!reading)return;
    const content=document.createElement("div");
    const name=document.createElement("p");name.textContent=pdfFile?.name??"";
    const percentage=readStatus.match(/(\d+)\s*%/);
    const value=percentage?Math.min(100,Number(percentage[1])):undefined;
    const number=document.createElement("strong");number.className="order-loading-percentage";
    number.textContent=value===undefined?"Procesando…":`${value}%`;
    const progress=document.createElement("progress");progress.max=100;
    progress.setAttribute("aria-label","Progreso de lectura del documento");
    if(value!==undefined)progress.value=value;
    const status=document.createElement("p");status.setAttribute("role","status");
    status.textContent=readStatus||"Preparando documento…";
    content.className="order-loading-content";content.append(name,number,progress,status);
    alerts.update({html:content});
  },[reading,readStatus,pdfFile]);
  const pdfInput = useRef<HTMLInputElement>(null);
  const pdfCache = useRef(new Map<string, File>());
  const [draft, setDraft] = useState<PurchaseOrderDraft | null>(null);
  const [saved, setSaved] = useState<SavedOrder | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [productResolution,setProductResolution]=useState<{draft:PurchaseOrderDraft;products:OrderProduct[];canManage:boolean}|null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setProcessing(busy || dirty); return () => setProcessing(false); }, [busy, dirty, setProcessing]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (mode !== "list") return;
    const sequence = ++request.current;
    setLoading(true); setError("");
    const timer = setTimeout(() => {
      listOrders(company.id, { search, status, kind, page }).then(result => {
        if (!alive.current || request.current !== sequence) return;
        if (result.ok) { setOrders(result.value.orders); setCount(result.value.count); }
        else { setOrders([]); setCount(0); setError(result.error); }
        setLoading(false);
      }).catch(() => { if (alive.current && request.current === sequence) { setError("No se pudo cargar el listado."); setLoading(false); } });
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [company.id, search, status, kind, page, reload, mode]);
  const assigned = catalog.businesses.find(b => b.id === company.id)?.details.clients ?? [];
  const clients = catalog.clients.filter(c => c.active && assigned.includes(c.id));
  const selectedClient = catalog.clients.find(c => c.id === draft?.client_id);
  const template = selectedClient?.orderTemplate || saved?.client_snapshot.order_template || "";
  async function readDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft || busy) return;
    if (!(template===consignmentCompany ? /\.html?$/i : /\.pdf$/i).test(file.name) || file.size > 25 * 1024 * 1024) { setError(template===consignmentCompany ? "Selecciona un HTM o HTML de hasta 25 MB." : "Selecciona un PDF de hasta 25 MB."); return; }
    if (draft.revision === 0 && (!selectedClient || !clients.some(c => c.id === selectedClient.id) || !template)) return;
    if (draft.revision === 0 && (draft.source || draft.number || draft.items.some(item => item.description)) && !await confirmAction("La lectura reemplazará número, fecha, moneda, partidas e IVA. ¿Continuar?")) return;
    setPdfFile(file); setPdfPage(1); setError("");
    if (pdfCache.current.size >= 10) pdfCache.current.delete(pdfCache.current.keys().next().value!);
    pdfCache.current.set(draft.id, file);
    if (draft.revision > 0) { setNotice("Documento abierto para validación. No se modificaron los datos guardados."); return; }
    setBusy(true); setReading(true); setReadStatus("Abriendo documento…");
    try {
      const extracted = template===consignmentCompany ? extractConsignment(parseConsignmentHtml(await readHtmlFile(file))) : await readOrderPdf(file, template, text => { if (alive.current) setReadStatus(text); });
      if (!alive.current) return;
      const next = draftFromExtraction(company.id, draft.client_id, extracted, file, template);
      if (!next.order_date) extracted.warnings.push(`No se pudo convertir con seguridad la fecha «${extracted.date || "no encontrada"}». Captura la fecha de la OC en dd/mm/aaaa.`);
      setDraft({ ...draft, number: next.number, order_date: next.order_date, currency: next.currency, items: next.items, tax: next.tax, source: next.source });
      setDirty(true); setNotice("");
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "No se pudo leer el documento."); }
    finally { if (alive.current) { setBusy(false); setReading(false); setReadStatus(""); } }
  }
  async function back() {
    if (busy || (dirty && !await confirmAction("¿Descartar los cambios sin guardar?"))) return;
    setMode("list"); setDraft(null); setSaved(null); setDirty(false); setError(""); setPdfFile(null); setReadStatus("");
  }
  async function open(id: string) {
    setBusy(true); setError("");
    try {
      const data = unwrap(await getOrder(company.id, id));
      if (!alive.current) return;
      setSaved(data.order); setDraft(data.order); setEvents(data.events); setMode("detail"); setDirty(false); setPdfFile(pdfCache.current.get(id) ?? null); setPdfPage(1);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "No se pudo abrir la orden."); }
    finally { if (alive.current) setBusy(false); }
  }
  function update(values: Partial<PurchaseOrderDraft>) { setDraft(previous => previous ? { ...previous, ...values } : previous); setDirty(true); setNotice(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    await persist(draft);
  }
  async function persist(value:PurchaseOrderDraft) {
    setError("");
    try {
      const values = validateOrder(value);
      setBusy(true);
      if(values.items.some(item=>item.kind==="parts")){
        const options=unwrap(await orderProductOptions(values.business_id,values.client_id));
        if(missingOrderProducts(values.items,options.products).length){setProductResolution({draft:values,...options});return;}
      }
      const id = unwrap(await saveOrder(values));
      setDirty(false); setNotice("Orden guardada en Supabase.");
      const data = unwrap(await getOrder(company.id, id));
      if (!alive.current) return;
      setSaved(data.order); setDraft(data.order); setEvents(data.events); setMode("detail");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la orden."); }
    finally { setBusy(false); }
  }
  const readonly = mode === "detail"; 
  const reviewWarnings = orderReviewWarnings(draft);
  let calculated: ReturnType<typeof totals> | null = null;
  try { if (draft) calculated = totals(draft.items, draft.tax); } catch { /* Incomplete numeric inputs are allowed while editing. */ }
  return <div className="orders-workspace">
    {productResolution&&<OrderProductDialog {...productResolution} onCancel={()=>setProductResolution(null)} onComplete={()=>{const value=productResolution.draft;setProductResolution(null);void persist(value);}}/>}
    <header className="companies-heading"><div><p className="eyebrow">{company.name} / OPERACIÓN</p><h1>{mode === "list" ? "Órdenes de compra" : readonly ? `OC ${draft?.number}` : draft?.revision ? "Editar orden" : "Nueva orden"}</h1></div>
      <div className="orders-actions">{mode === "list" ? <button className="client-primary" disabled={busy || !catalog.ready || !clients.length} onClick={() => { setDraft(blankOrder(company.id)); setPdfFile(null); setPdfPage(1); setMode("edit"); setDirty(true); setError(""); setNotice(""); }}><Plus size={17}/>Nueva orden</button> : <><input ref={pdfInput} className="sr-only" tabIndex={-1} type="file" accept={template===consignmentCompany ? ".htm,.html,text/html" : ".pdf,application/pdf"} aria-label="Documento de la OC" disabled={busy || !draft?.client_id || (!draft.revision && !template)} onChange={readDocument}/><button className="client-secondary" disabled={busy || !catalog.ready || !draft?.client_id || (!draft.revision && (!template || !clients.some(c => c.id === draft.client_id)))} title={!draft?.client_id ? "Selecciona primero el cliente" : !template && !draft.revision ? "El cliente no tiene una plantilla de lectura" : undefined} onClick={() => pdfInput.current?.click()}><ScanLine size={17}/>{reading ? "Leyendo…" : draft?.revision ? "Cargar documento" : "Leer documento"}</button><button className="client-secondary" disabled={busy} onClick={back}><ArrowLeft size={17}/>Volver al listado</button></>}</div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="catalog-notice" role="status">{notice}</p>}
    {mode === "list" && <>
      {catalog.error && <p className="error" role="alert">{catalog.error}</p>}
      {catalog.ready && !clients.length && <p className="orders-notice">No hay clientes activos asociados a {company.name}. Puedes asociarlos en Mis empresas.</p>}
      <div className="orders-toolbar"><label className="orders-search"><Search size={17}/><input aria-label="Buscar número de OC" placeholder="Buscar número de OC" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}/></label><label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Tipo<select value={kind} onChange={e => { setKind(e.target.value); setPage(0); }}><option value="">Todos</option><option value="parts">Refacciones</option><option value="service">Servicios</option><option value="mixed">Mixtas</option></select></label><button className="icon-button" title="Actualizar listado" aria-label="Actualizar listado" disabled={loading} onClick={() => setReload(n => n + 1)}><RefreshCw size={18}/></button></div>
      <div className="orders-table-scroll" aria-busy={loading}><table className="orders-table"><thead><tr><th>Orden / fecha</th><th>Cliente</th><th>Tipo</th><th>Próxima entrega</th><th>Estado / avance</th><th className="numeric">Total</th></tr></thead><tbody>{!loading && orders.map(order => <tr key={order.id}><td><button className="order-link" disabled={busy} onClick={() => open(order.id)}>{order.number}</button><small>{displayDate(order.order_date)}</small></td><td>{order.client_snapshot.name}</td><td>{order.kind === "mixed" ? "Mixta" : order.kind === "parts" ? "Refacciones" : "Servicio"}</td><td><span className={deliveryIndicator(order.commitment_date,order.status,order.fulfillment)}>{displayDate(order.commitment_date)}</span></td><td><span className={`order-badge ${orderIndicator(order.status,order.fulfillment).className}`}>{orderIndicator(order.status,order.fulfillment).label}</span><small>{fulfillmentLabel(order.kind, order.fulfillment)}</small></td><td className="numeric">{money(order.total, order.currency)}<small>{order.currency}</small></td></tr>)}</tbody></table>
      {loading ? <div className="catalog-empty" role="status">Cargando órdenes…</div> : !orders.length && <div className="catalog-empty"><FileText size={30}/><h2>{error ? "Listado no disponible" : "No hay órdenes para mostrar"}</h2></div>}</div>
      <footer className="catalog-pagination"><span>{count} órdenes</span><div><button className="icon-button" aria-label="Página anterior" title="Página anterior" disabled={page === 0 || loading} onClick={() => setPage(n => n - 1)}><ChevronLeft size={18}/></button><span>{page + 1} / {Math.max(1, Math.ceil(count / 25))}</span><button className="icon-button" aria-label="Página siguiente" title="Página siguiente" disabled={(page + 1) * 25 >= count || loading} onClick={() => setPage(n => n + 1)}><ChevronRight size={18}/></button></div></footer>
    </>}
    {draft && (mode === "edit" || mode === "detail") && <div className="order-review-layout"><div className="order-form-column">
      {!!reviewWarnings.length && <div className="order-reading-notes"><div className="orders-notice" role="status"><strong>Revisar</strong><ul>{reviewWarnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></div></div>}
      {readonly && <div className="order-detail-heading"><span className={`order-badge ${orderIndicator(draft.status,draft.fulfillment).className}`}>{orderIndicator(draft.status,draft.fulfillment).label} · Versión {draft.revision}</span>{hasPermission(access,"edit_orders")&&<button className="client-secondary" disabled={busy || draft.status === "cancelled"} onClick={() => { setMode("edit"); setNotice(""); }}><Pencil size={16}/>Editar orden</button>}{saved&&<DeleteOrderButton order={saved} disabled={busy} onBusy={setBusy} onDeleted={()=>{pdfCache.current.delete(saved.id);setDraft(null);setSaved(null);setPdfFile(null);setEvents([]);setDirty(false);setMode("list");setReload(n=>n+1);setNotice("Orden eliminada. La acción quedó registrada en Bitácora.");}}/>}</div>}
      <form onSubmit={save}>
        <fieldset className="order-fields" disabled={readonly || busy}>
          <legend>Datos de la orden</legend>
          <div className="order-grid">
            <label className="order-wide">Cliente<select required value={draft.client_id} disabled={draft.revision > 0 || !catalog.ready} onChange={async e => { const clientId=e.target.value; if (draft.source && !await confirmAction("Cambiar de cliente descartará los datos leídos del PDF. ¿Continuar?")) return; setPdfFile(null); pdfCache.current.delete(draft.id); update(draft.source ? { ...blankOrder(company.id), id: draft.id, client_id: clientId } : { client_id: clientId }); }}><option value="">Selecciona un cliente</option>{draft.revision > 0 ? <option value={draft.client_id}>{saved?.client_snapshot.name}</option> : clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{draft.client_id && !template && !draft.revision && <span>Este cliente no tiene una plantilla de lectura configurada.</span>}</label>
            <label>Número de OC<input required maxLength={100} value={draft.number} onChange={e => update({ number: e.target.value })}/></label>
            <div className="order-date-field"><span>Fecha de la OC</span><OrderDateInput required label="Fecha de la OC" value={draft.order_date} onChange={value => update({ order_date: value })}/></div>

            <label>Moneda<select value={draft.currency} onChange={e => update({ currency: e.target.value as PurchaseOrderDraft["currency"] })}><option>MXN</option><option>USD</option><option>EUR</option></select></label>
            <label>Estado<select value={draft.status} onChange={e => update({ status: e.target.value as PurchaseOrderDraft["status"] })}>{(saved?.status === "draft") && <option value="draft">Borrador</option>}<option value="confirmed">Registrada</option>{draft.revision > 0 && <option value="cancelled">Cancelada</option>}</select></label>


            <label className="order-wide">Dirección de envío / lugar del servicio<input maxLength={1000} value={draft.delivery_address} onChange={e => update({ delivery_address: e.target.value })}/></label>
            {draft.status === "cancelled" && <label className="order-wide">Motivo de cancelación<textarea required maxLength={1000} value={draft.cancellation_reason} onChange={e => update({ cancellation_reason: e.target.value })}/></label>}
          </div>
        </fieldset>
        <fieldset className="order-fields" disabled={readonly || busy}><legend>Partidas</legend>
          <div className="orders-table-scroll"><table className="orders-table order-items"><thead><tr><th>#</th><th>Código / descripción</th><th>Unidad</th><th>Cantidad</th><th>Precio unitario</th><th>Descuento</th><th className="numeric">Importe</th>{!readonly && <th><span className="sr-only">Acciones</span></th>}</tr></thead><tbody>{draft.items.map((item, index) => <Fragment key={item.id}><tr><td>{index + 1}</td><td><input aria-label={`Código ${index + 1}`} required={item.kind==="parts"&&!inheritedCode("",item.subitems ?? [])} maxLength={item.kind==="parts"?80:100} value={item.code} placeholder="Código" onChange={e => update({ items: draft.items.map((v, i) => i === index ? { ...v, code: e.target.value } : v) })}/><textarea aria-label={`Descripción ${index + 1}`} required maxLength={2000} value={item.description} placeholder="Descripción" onChange={e => update({ items: draft.items.map((v, i) => i === index ? { ...v, description: e.target.value } : v) })}/></td>{([['unit', 'Unidad'], ['quantity', 'Cantidad'], ['unit_price', 'Precio'], ['discount', 'Descuento']] as const).map(([key, label]) => <td key={key}><input aria-label={`${label} ${index + 1}`} required={key !== "unit"} inputMode={key === "unit" ? "text" : "decimal"} maxLength={key === "unit" ? 30 : 20} value={item[key]} onChange={e => update({ items: draft.items.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v) })}/></td>)}<td className="numeric">{calculated ? money(calculated.amounts[index], draft.currency) : "—"}</td>{!readonly && <td><button className="icon-button" type="button" title={`Quitar partida ${index + 1}`} aria-label={`Quitar partida ${index + 1}`} onClick={() => update({ items: draft.items.filter((_, i) => i !== index) })}><Trash2 size={16}/></button></td>}</tr><tr className="order-item-delivery-row"><td colSpan={readonly ? 7 : 8}><div className="order-item-delivery"><label>Tipo<select required aria-label={`Tipo partida ${index+1}`} value={item.kind} onChange={e=>update({items:draft.items.map((v,i)=>i===index ? {...v,kind:e.target.value as typeof item.kind} : v)})}><option value="parts">Refacciones</option><option value="service">Servicio</option></select></label><div className="order-date-field"><span>{item.kind === "service" ? "Fecha del servicio" : "Fecha de entrega"} · Partida {index+1}</span><OrderDateInput required label={`Fecha de entrega partida ${index+1}`} value={item.commitment_date} onChange={value=>update({items:draft.items.map((v,i)=>i===index ? {...v,commitment_date:value} : v)})}/></div><label>{item.kind === "service" ? "Avance del servicio" : "Estado de envío"}<select aria-label={`Estado de envío partida ${index+1}`} value={item.fulfillment} disabled={draft.status==="draft"||Number(item.shipped_quantity??0)>0} onChange={e=>update({items:draft.items.map((v,i)=>i===index ? {...v,fulfillment:e.target.value as typeof item.fulfillment,completed_date:e.target.value==="complete" ? v.completed_date : ""} : v)})}>{["pending","partial","complete"].map(state=><option key={state} value={state}>{fulfillmentLabel(item.kind,state)}</option>)}</select></label>{item.fulfillment==="complete" && <div className="order-date-field"><span>{item.kind==="service" ? "Fecha real del servicio" : "Fecha real del envío"}</span><OrderDateInput disabled={Number(item.shipped_quantity??0)>0} required label={`Fecha real partida ${index+1}`} value={item.completed_date} onChange={value=>update({items:draft.items.map((v,i)=>i===index ? {...v,completed_date:value} : v)})}/></div>}</div>{Number(item.shipped_quantity??0)>0&&<p>Enviado desde almacén: {item.shipped_quantity} {item.unit}</p>}<OrderSubitems items={item.subitems ?? []} position={index+1} readonly={readonly} onChange={subitems=>update({items:draft.items.map((v,i)=>i===index?{...v,subitems}:v)})}/></td></tr></Fragment>)}</tbody></table></div>
          {!readonly && <button className="client-secondary order-add-item" type="button" disabled={draft.items.length >= 200} onClick={() => update({ items: [...draft.items, blankItem()] })}><Plus size={16}/>Agregar partida</button>}
          <div className="order-bottom"><label>Observaciones<textarea maxLength={4000} value={draft.notes} onChange={e => update({ notes: e.target.value })}/></label><div className="order-totals"><div><span>Subtotal</span><strong>{calculated ? money(calculated.subtotal, draft.currency) : "—"}</strong></div><label>IVA (importe)<input required aria-label="IVA (importe)" inputMode="decimal" value={draft.tax} onChange={e => update({ tax: e.target.value })}/></label><div><span>Total {draft.currency}</span><strong>{calculated ? money(calculated.total, draft.currency) : "—"}</strong></div></div></div>
        </fieldset>
        {!readonly && <footer className="order-save"><span>{dirty ? "Cambios sin guardar" : "Sin cambios"}</span><button className="client-secondary" type="button" disabled={busy} onClick={back}>Cancelar</button><button className="client-primary" type="submit" disabled={busy || !catalog.ready}><Save size={17}/>{busy ? "Guardando…" : "Guardar orden"}</button></footer>}
      </form>
      {readonly && saved && <OrderPurchases business={company.id} id={saved.id}/>}
      {readonly && saved && <section className="order-file"><h2>Expediente</h2><div className="order-file-grid"><div><h3>Cliente al registrar</h3><p>{saved.client_snapshot.legal_name || saved.client_snapshot.name}</p><p>RFC: {saved.client_snapshot.rfc || "Sin registrar"}</p><p>{saved.client_snapshot.contact} {saved.client_snapshot.email}</p><h3>Razón social al registrar</h3><p>{saved.business_snapshot.legal_name || saved.business_snapshot.name}</p><p>RFC: {saved.business_snapshot.rfc || "Sin registrar"}</p></div><div><h3>Documento de origen</h3><p>{saved.source?.filename || "Captura manual"}</p><p className="orders-muted">{saved.source ? "PDF original no almacenado. Pendiente conectar Cloudflare R2." : "Sin documento adjunto."}</p>{saved.source && <details><summary>Datos originales de la lectura</summary><pre>{JSON.stringify(saved.source.extracted, null, 2)}</pre></details>}</div></div><h3>Historial (últimas 50 versiones)</h3><ol className="order-history">{events.slice(0,50).map((event,eventIndex) => <li key={event.id}><details><summary>Versión {event.revision} · {event.action === "created" ? "Creación" : event.action === "cancelled" ? "Cancelación" : event.action === "identity_migrated" ? "Preparación de trazabilidad" : event.action === "kind_migrated" ? "Migración de tipo a partidas" : event.action === "delivery_migrated" ? "Migración de entregas a partidas" : "Actualización"} · {new Date(event.occurred_at).toLocaleString("es-MX")}</summary><p><strong>{orderActor(event)}</strong></p><h4>Cambios respecto a la versión anterior</h4><ul className="order-history-changes">{orderChanges(event,events[eventIndex+1]).map((change,index)=><li key={index}>{change}</li>)}</ul><h4>Datos de esta versión</h4><p>OC {event.snapshot.order.number} · {statusLabels[event.snapshot.order.status]} · {fulfillmentLabel(event.snapshot.order.kind, event.snapshot.order.fulfillment)}</p><p>Compromiso: {displayDate(event.snapshot.order.commitment_date)} · Total: {money(event.snapshot.order.total, event.snapshot.order.currency)}</p><p>{event.snapshot.order.notes || "Sin observaciones"}</p><ul>{event.snapshot.items.map((item, i) => <li key={i}>{item.quantity} {item.unit} · {item.description} · {money(item.unit_price, event.snapshot.order.currency)} · Entrega: {displayDate(item.commitment_date ?? event.snapshot.order.commitment_date)} · {fulfillmentLabel(item.kind ?? event.snapshot.order.kind,item.fulfillment ?? event.snapshot.order.fulfillment)}{(item.completed_date ?? event.snapshot.order.completed_date) && ` · Fecha real: ${displayDate(item.completed_date ?? event.snapshot.order.completed_date)}`}</li>)}</ul></details></li>)}</ol></section>}
    </div><div className="order-document-column">{pdfFile ? /\.html?$/i.test(pdfFile.name) ? <HtmlPreview file={pdfFile}/> : <PdfPreview key={`${pdfFile.name}-${pdfFile.lastModified}`} file={pdfFile} page={pdfPage} onPage={setPdfPage}/> : <aside className="preview preview-empty"><FileText size={34}/><h2>Documento original</h2><p>{draft.source ? "Documento no disponible en esta sesión. Carga el original para validarlo." : "La previsualización del documento aparecerá aquí."}</p></aside>}{pdfFile && <p className="order-document-name">{pdfFile.name} · Archivo local, aún no almacenado en R2</p>}</div></div>}
  </div>;
}
