"use client";
import {useEffect,useState} from 'react';
import {Truck,Save,X,RefreshCw,ChevronLeft,ChevronRight} from 'lucide-react';
import Decimal from 'decimal.js';
import InvoiceUpload from './invoice-upload';
import CrudModal from './crud-modal';
import OrderDateInput from './order-date-input';
import {useCompany} from './workspace-shell';
import {confirmAction} from '../lib/alerts';
import {localReceiptDate} from '../lib/warehouse';
import {shippingLimit,validateShipment,type ShipmentInput,type ShippingOrder,type ShipmentSummary,type ShipmentDetail} from '../lib/warehouse-shipments';
import {getShippingOptions,listShipments,getShipment,saveShipment} from './shipment-actions';

const date=(v:string)=>v.split('-').reverse().join('/');
const quantity=(v:string)=>new Decimal(v).toFixed();
export default function WarehouseShipments(){
 const {company,setProcessing}=useCompany();
 const [rows,setRows]=useState<ShipmentSummary[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(0),[reload,setReload]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState<ShipmentInput|null>(null),[options,setOptions]=useState<ShippingOrder[]>([]),[quantities,setQuantities]=useState<Record<string,string>>({}),[detail,setDetail]=useState<ShipmentDetail|null>(null);
 const selected=options.find(o=>o.id===draft?.order_id);
 useEffect(()=>{let active=true;setLoading(true);setError('');void listShipments(company.id,page).then(r=>{if(active){if(r.ok){setRows(r.value.rows);setCount(r.value.count);}else setError(r.error);}}).catch(()=>{if(active)setError('No se pudo conectar con el almacén.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[company.id,page,reload]);
 useEffect(()=>{setProcessing(busy||!!draft||!!detail);return()=>setProcessing(false);},[busy,draft,detail,setProcessing]);
 async function openNew(){setBusy(true);setError('');setNotice('');try{const r=await getShippingOptions(company.id);if(!r.ok){setError(r.error);return;}setOptions(r.value);setQuantities({});setDraft({id:crypto.randomUUID(),business_id:company.id,order_id:'',date:localReceiptDate(),reference:'',invoice:'',recipient:'',notes:'',items:[]});}catch{setError('No se pudo abrir la salida.');}finally{setBusy(false);}}
 async function openDetail(id:string){setBusy(true);setError('');try{const r=await getShipment(company.id,id);if(r.ok)setDetail(r.value);else setError(r.error);}catch{setError('No se pudo abrir la salida.');}finally{setBusy(false);}}
 function close(){if(!busy){setDraft(null);setDetail(null);setError('');}}
 async function submit(){
  if(!draft||!selected||busy)return;setError('');let payload:ShipmentInput;
  try{
   const items=selected.items.flatMap(i=>{const value=(quantities[i.id]??'').trim();if(!value||/^0+(\.0+)?$/.test(value))return [];
    if(i.legacy||!/^\d{1,9}(\.\d{1,4})?$/.test(value)||new Decimal(value).gt(shippingLimit(i)))throw new Error(`Revisa la cantidad de la partida ${i.position}. Máximo: ${shippingLimit(i)} ${i.unit}.`);
    return [{item_id:i.id,quantity:value}];});
   payload=validateShipment({...draft,items});if(payload.date<selected.date)throw new Error('La salida no puede ser anterior a la OC.');
  }catch(e){setError(e instanceof Error?e.message:'Revisa las cantidades.');return;}
  if(!await confirmAction('¿Registrar la salida de almacén? Se descontarán las existencias y se actualizará el envío de la OC. El movimiento no podrá editarse.'))return;
  setBusy(true);try{const r=await saveShipment(payload);if(!r.ok){setError(r.error);return;}setDraft(null);setPage(0);setReload(n=>n+1);setNotice('Salida registrada. Las existencias y el avance de la OC fueron actualizados.');}catch{setError('No se pudo confirmar el guardado. Reintenta sin cerrar este formulario para evitar duplicar la salida.');}finally{setBusy(false);}
 }
 return <>
  {error&&!draft&&!detail&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="products-toolbar"><button className="client-primary" disabled={busy} onClick={()=>void openNew()}><Truck size={18}/>Registrar salida</button><button className="icon-button" title="Actualizar salidas" aria-label="Actualizar salidas" disabled={loading||busy} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
  {loading?<div className="products-empty" role="status">Cargando salidas...</div>:<>
   <div className="products-table"><table><thead><tr><th>Salida / fecha</th><th>OC / cliente</th><th>Remision</th><th>Factura</th><th>Registró</th><th>Registro (CDMX)</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><button className="purchase-number" disabled={busy} onClick={()=>void openDetail(r.id)}>SAL-{r.folio}</button><span>{date(r.date)}</span></td><td>{r.order_number}<span>{r.client_name}</span></td><td>{r.reference||'Sin remisión'}</td><td>{r.invoice||'Sin factura'}</td><td>{r.actor_name}</td><td>{new Date(r.created_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</td></tr>)}</tbody></table></div>
   {!rows.length&&<div className="products-empty">No hay salidas registradas</div>}
   <div className="products-pagination"><span>{count} salidas</span><button className="icon-button" aria-label="Página anterior" title="Página anterior" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{page+1} / {Math.max(1,Math.ceil(count/20))}</span><button className="icon-button" aria-label="Página siguiente" title="Página siguiente" disabled={(page+1)*20>=count||busy} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>
  </>}
  <CrudModal open={!!draft||!!detail} className="purchase-dialog" labelledBy="shipment-title" onRequestClose={close}>
   <form onSubmit={e=>{e.preventDefault();void submit();}}>
    <div className="crud-modal-heading"><h2 id="shipment-title">{detail?`Salida SAL-${detail.folio}`:'Registrar salida'}</h2><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar salida" disabled={busy} onClick={close}><X size={20}/></button></div>
    <div className="crud-modal-body">{error&&<p className="error" role="alert">{error}</p>}
     {draft&&<fieldset className="product-fields" disabled={busy}><InvoiceUpload key={draft.id} context={`Salida · ${company.name}`}/>
      <div className="product-form-grid"><label className="product-wide">OC del cliente *<select required value={draft.order_id} onChange={e=>{setDraft({...draft,order_id:e.target.value});setQuantities({});}}><option value="">Selecciona una OC</option>{options.map(o=><option key={o.id} value={o.id}>{o.number} · {o.client}</option>)}</select></label><div><label>Fecha de salida *</label><OrderDateInput label="Fecha de salida" required value={draft.date} onChange={date=>setDraft({...draft,date})}/></div><label>Remision<input maxLength={100} value={draft.reference} onChange={e=>setDraft({...draft,reference:e.target.value})}/></label><label>Factura<input maxLength={100} value={draft.invoice} onChange={e=>setDraft({...draft,invoice:e.target.value})}/></label><label className="product-wide">Destinatario / responsable de recepción<input maxLength={160} value={draft.recipient} onChange={e=>setDraft({...draft,recipient:e.target.value})}/></label></div>
      {selected&&<p className="warehouse-notes"><strong>Dirección de entrega: </strong>{selected.delivery_address||'Sin dirección registrada en la OC'}</p>}
      {!options.length&&<p role="status">No hay OC registradas con refacciones pendientes de enviar.</p>}
      {selected?.items.map(i=><section className="warehouse-receipt-line" key={i.id}><h3>Partida {i.position} · {i.description}</h3>{i.legacy&&<p className="error">Avance manual anterior sin cantidades de almacén. Requiere revisión antes de registrar salidas.</p>}<div className="warehouse-receipt-quantity"><dl><div><dt>Pendiente de enviar</dt><dd>{quantity(i.pending)} {i.unit}</dd></div><div><dt>Asignado a esta partida</dt><dd>{quantity(i.reserved)} {i.unit}</dd></div><div><dt>Stock libre compartido</dt><dd>{quantity(i.available)} {i.unit}</dd></div></dl><label>Cantidad a enviar ({i.unit})<input aria-label={`Enviar partida ${i.position}`} disabled={i.legacy||new Decimal(shippingLimit(i)).lte(0)} inputMode="decimal" maxLength={14} placeholder="0" value={quantities[i.id]??''} onChange={e=>setQuantities({...quantities,[i.id]:e.target.value})}/></label></div></section>)}
      <label className="warehouse-notes">Observaciones<textarea rows={3} maxLength={4000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
     </fieldset>}
     {detail&&<><dl className="warehouse-detail"><div><dt>OC / cliente</dt><dd>{detail.order_number} · {detail.client_name}</dd></div><div><dt>Fecha de salida</dt><dd>{date(detail.date)}</dd></div><div><dt>Remision</dt><dd>{detail.reference||'Sin remisión'}</dd></div><div><dt>Factura</dt><dd>{detail.invoice||'Sin factura'}</dd></div><div><dt>Destinatario</dt><dd>{detail.recipient||'Sin especificar'}</dd></div><div><dt>Registró</dt><dd>{detail.actor_name}</dd></div><div><dt>Dirección de entrega</dt><dd>{detail.delivery_address||'Sin especificar'}</dd></div></dl>{detail.items.map(i=><section className="warehouse-receipt-line" key={i.id}><h3>Partida {i.position} · {i.description}</h3><strong>{quantity(i.quantity)} {i.unit}</strong><ul>{i.sources.map((s,index)=><li key={index}>{s.adjustment_folio?`Ajuste AJ-${s.adjustment_folio}`:`Entrada ENT-${s.receipt_folio}`} · {quantity(s.quantity)} {s.unit} · {s.origin}</li>)}</ul></section>)}{detail.notes&&<p className="warehouse-notes">{detail.notes}</p>}</>}
    </div><div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>{detail?'Cerrar':'Cancelar'}</button>{draft&&<button className="client-primary" disabled={busy||!selected}><Save size={18}/>{busy?'Registrando...':'Registrar salida'}</button>}</div>
   </form>
  </CrudModal>
 </>;
}
