"use client";
import {useEffect,useState} from 'react';
import {Plus,Save,X,RefreshCw,ChevronLeft,ChevronRight,Search} from 'lucide-react';
import Decimal from 'decimal.js';
import WarehouseStockEditor from '../../warehouse-stock-editor';
import {hasPermission} from '../../../lib/access';
import InvoiceUpload from '../../invoice-upload';
import CrudModal from '../../crud-modal';
import WarehouseShipments from '../../warehouse-shipments';
import OrderDateInput from '../../order-date-input';
import {useCompany} from '../../workspace-shell';
import {confirmAction} from '../../../lib/alerts';
import {localReceiptDate,receiptKey,validateReceipt,type ReceiptInput,type ReceiptPurchase,type ReceiptSummary,type ReceiptDetail,type WarehouseBalance} from '../../../lib/warehouse';
import {getReceiptOptions,listReceipts,getReceipt,saveReceipt,getWarehouseBalances} from '../../warehouse-actions';
import '../../products.css';
import '../../purchases.css';
import '../../warehouse.css';

const formatDate=(v:string)=>v.split('-').reverse().join('/');
const formatQuantity=(v:string)=>new Decimal(v).toFixed();
export default function WarehousePage(){
 const {company,access,setProcessing}=useCompany();
 const [view,setView]=useState<'receipts'|'balances'|'shipments'>('receipts');
 const [rows,setRows]=useState<ReceiptSummary[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(0);
 const [balances,setBalances]=useState<WarehouseBalance[]>([]),[search,setSearch]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const [draft,setDraft]=useState<ReceiptInput|null>(null),[options,setOptions]=useState<ReceiptPurchase[]>([]),[quantities,setQuantities]=useState<Record<string,string>>({}),[detail,setDetail]=useState<ReceiptDetail|null>(null);
 const selected=options.find(p=>p.id===draft?.purchase_id);
 useEffect(()=>{
  if(view==='shipments')return;
  let active=true;setLoading(true);setError('');
  async function load(){try{
   if(view==='receipts'){const r=await listReceipts(company.id,page);if(active){if(r.ok){setRows(r.value.rows);setCount(r.value.count);}else setError(r.error);}}
   else {const r=await getWarehouseBalances(company.id);if(active){if(r.ok)setBalances(r.value);else setError(r.error);}}
  }catch{if(active)setError('No se pudo conectar con el almacén.');}finally{if(active)setLoading(false);}}
  void load();return()=>{active=false;};
 },[company.id,view,page,reload]);
 useEffect(()=>{setProcessing(busy||!!draft||!!detail);return()=>setProcessing(false);},[busy,draft,detail,setProcessing]);
 async function openNew(){setBusy(true);setError('');setNotice('');try{
  const r=await getReceiptOptions(company.id);if(!r.ok){setError(r.error);return;}
  setOptions(r.value);setQuantities({});setDraft({id:crypto.randomUUID(),business_id:company.id,purchase_id:'',date:localReceiptDate(),reference:'',invoice:'',notes:'',items:[]});
 }catch{setError('No se pudo abrir la recepción.');}finally{setBusy(false);}}
 async function openDetail(id:string){setBusy(true);setError('');try{const r=await getReceipt(company.id,id);if(r.ok)setDetail(r.value);else setError(r.error);}catch{setError('No se pudo abrir la entrada.');}finally{setBusy(false);}}
 function close(){if(!busy){setDraft(null);setDetail(null);setError('');}}
 async function submit(){
  if(!draft||!selected||busy)return;setError('');
  let payload:ReceiptInput;
  try{
   const items=selected.buckets.flatMap(b=>{const value=(quantities[receiptKey(b)]??'').trim();if(!value||/^0+(\.0+)?$/.test(value))return [];
    if(!/^\d{1,9}(\.\d{1,4})?$/.test(value)||new Decimal(value).gt(b.remaining))throw new Error(`Revisa la cantidad de la partida ${b.position}: máximo ${formatQuantity(b.remaining)} ${b.unit}.`);
    return [{line_id:b.line_id,item_id:b.item_id,quantity:value}];});
   payload=validateReceipt({...draft,items});
   if(payload.date<selected.date)throw new Error('La recepción no puede ser anterior a la compra.');
  }catch(e){setError(e instanceof Error?e.message:'Revisa las cantidades.');return;}
  if(!await confirmAction('¿Registrar la recepción y generar las entradas al almacén? Las cantidades registradas no podrán editarse.'))return;
  setBusy(true);
  try{const r=await saveReceipt(payload);if(!r.ok){setError(r.error);return;}setDraft(null);setPage(0);setView('receipts');setReload(n=>n+1);setNotice('Recepción registrada. Las existencias fueron actualizadas.');}
  catch{setError('No se pudo confirmar el guardado. Reintenta sin cerrar este formulario para evitar duplicar la entrada.');}finally{setBusy(false);}
 }
 const visibleBalances=balances.filter(b=>`${b.sku} ${b.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <section className="products-workspace">
  <div className="companies-heading"><div><p className="eyebrow">{company.name} / ALMACÉN COMPARTIDO</p><h1>Almacén</h1></div>{view!=='shipments'&&<button className="client-primary" disabled={busy} onClick={()=>void openNew()}><Plus size={18}/>Registrar recepción</button>}</div>
  {error&&!draft&&!detail&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="warehouse-tabs" role="tablist" aria-label="Vistas del almacén"><button role="tab" aria-selected={view==='receipts'} onClick={()=>setView('receipts')}>Recepciones y entradas</button><button role="tab" aria-selected={view==='shipments'} onClick={()=>setView('shipments')}>Salidas</button><button role="tab" aria-selected={view==='balances'} onClick={()=>setView('balances')}>Existencias</button></div>
  {view==='shipments'?<WarehouseShipments/>:<>
  <div className="products-toolbar">{view==='balances'&&hasPermission(access,'edit_warehouse')&&!loading&&<WarehouseStockEditor options={balances} onSaved={()=>{setReload(n=>n+1);setNotice('Inventario registrado.');}}/>}{view==='balances'&&<label className="products-search"><Search size={18}/><input aria-label="Buscar producto" placeholder="Código o descripción" value={search} onChange={e=>setSearch(e.target.value)}/></label>}<button className="icon-button" title="Actualizar almacén" aria-label="Actualizar almacén" disabled={loading||busy} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
  {loading?<div className="products-empty" role="status">Cargando almacén...</div>:view==='receipts'?<>
   <div className="products-table"><table><thead><tr><th>Entrada / fecha</th><th>Compra / proveedor</th><th>Remision</th><th>Factura</th><th>Recibió</th><th>Registro (CDMX)</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><button className="purchase-number" disabled={busy} onClick={()=>void openDetail(r.id)}>ENT-{r.folio}</button><span>{formatDate(r.date)}</span></td><td>{r.purchase_number}<span>{r.supplier}</span></td><td>{r.reference||'Sin remisión'}</td><td>{r.invoice||'Sin factura'}</td><td>{r.actor_name}</td><td>{new Date(r.created_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</td></tr>)}</tbody></table></div>
   {!rows.length&&<div className="products-empty">No hay recepciones registradas</div>}
   <div className="products-pagination"><span>{count} recepciones</span><button className="icon-button" aria-label="Página anterior" title="Página anterior" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{page+1} / {Math.max(1,Math.ceil(count/20))}</span><button className="icon-button" aria-label="Página siguiente" title="Página siguiente" disabled={(page+1)*20>=count||busy} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>
  </>:<><div className="products-table"><table><thead><tr><th>Código interno</th><th>Producto</th><th>Unidad</th><th>Existencia física</th><th>Asignada a OC</th><th>Disponible</th>{hasPermission(access,"edit_warehouse")&&<th>Acciones</th>}</tr></thead><tbody>{visibleBalances.map(b=><tr key={`${b.product_id}:${b.unit}`}><td>{b.sku}</td><td>{b.description}</td><td>{b.unit}</td><td>{formatQuantity(b.quantity)}</td><td>{formatQuantity(b.reserved)}</td><td>{formatQuantity(b.available)}</td>{hasPermission(access,"edit_warehouse")&&<td><WarehouseStockEditor balance={b} onSaved={()=>{setReload(n=>n+1);setNotice("Existencia actualizada.");}}/></td>}</tr>)}</tbody></table></div>{!visibleBalances.length&&<div className="products-empty">No hay existencias para mostrar</div>}</>}
  </>}
  <CrudModal open={!!draft||!!detail} className="purchase-dialog" labelledBy="receipt-title" onRequestClose={close}>
   <form onSubmit={e=>{e.preventDefault();void submit();}}>
    <div className="crud-modal-heading"><h2 id="receipt-title">{detail?`Entrada ENT-${detail.folio}`:'Registrar recepción'}</h2><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar recepción" disabled={busy} onClick={close}><X size={20}/></button></div>
    <div className="crud-modal-body">{error&&<p className="error" role="alert">{error}</p>}
     {draft&&<fieldset className="product-fields" disabled={busy}><InvoiceUpload key={draft.id} context={`Recepción · ${company.name}`}/>
      <div className="product-form-grid"><label className="product-wide">Compra emitida *<select required value={draft.purchase_id} onChange={e=>{setDraft({...draft,purchase_id:e.target.value});setQuantities({});}}><option value="">Selecciona una compra</option>{options.map(p=><option key={p.id} value={p.id}>{p.number} · {p.supplier}</option>)}</select></label>
       <div><label>Fecha de recepción *</label><OrderDateInput label="Fecha de recepción" required value={draft.date} onChange={date=>setDraft({...draft,date})}/></div><label>Remision<input maxLength={100} value={draft.reference} onChange={e=>setDraft({...draft,reference:e.target.value})}/></label><label>Factura<input maxLength={100} value={draft.invoice} onChange={e=>setDraft({...draft,invoice:e.target.value})}/></label></div>
      {!options.length&&<p role="status">No hay compras emitidas pendientes de recibir para esta razón social.</p>}
      {selected?.buckets.map(b=><section className="warehouse-receipt-line" key={receiptKey(b)}><h3>Partida {b.position} · {b.description}</h3><p>{b.destination}</p><div className="warehouse-receipt-quantity"><dl><div><dt>Comprado para este destino</dt><dd>{formatQuantity(b.planned)} {b.unit}</dd></div><div><dt>Recibido</dt><dd>{formatQuantity(b.received)} {b.unit}</dd></div><div><dt>Pendiente</dt><dd>{formatQuantity(b.remaining)} {b.unit}</dd></div></dl><label>Cantidad recibida ({b.unit})<input aria-label={`Recibir partida ${b.position}, ${b.destination}`} disabled={new Decimal(b.remaining).lte(0)} inputMode="decimal" maxLength={14} placeholder="0" value={quantities[receiptKey(b)]??''} onChange={e=>setQuantities({...quantities,[receiptKey(b)]:e.target.value})}/></label></div></section>)}
      <label className="warehouse-notes">Observaciones<textarea rows={3} maxLength={4000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
     </fieldset>}
     {detail&&<><dl className="warehouse-detail"><div><dt>Compra</dt><dd>{detail.purchase_number} · {detail.supplier}</dd></div><div><dt>Fecha de recepción</dt><dd>{formatDate(detail.date)}</dd></div><div><dt>Remision</dt><dd>{detail.reference||'Sin remisión'}</dd></div><div><dt>Factura</dt><dd>{detail.invoice||'Sin factura'}</dd></div><div><dt>Recibió</dt><dd>{detail.actor_name}</dd></div></dl>{detail.items.map(i=><section className="warehouse-receipt-line" key={i.id}><h3>{i.description}</h3><p>{i.destination}</p><strong>{formatQuantity(i.quantity)} {i.unit}</strong></section>)}{detail.notes&&<p className="warehouse-notes">{detail.notes}</p>}</>}
    </div>
    <div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>{detail?'Cerrar':'Cancelar'}</button>{draft&&<button className="client-primary" disabled={busy||!selected}><Save size={18}/>{busy?'Registrando...':'Registrar entrada'}</button>}</div>
   </form>
  </CrudModal>
 </section>;
}
