"use client";
import {useEffect,useState} from 'react';
import {Pencil,Plus,Save,X} from 'lucide-react';
import Decimal from 'decimal.js';
import CrudModal from './crud-modal';
import {useCompany} from './workspace-shell';
import {confirmAction} from '../lib/alerts';
import {validateStockAdjustment,type StockAdjustment,type WarehouseBalance} from '../lib/warehouse';
import {adjustWarehouseStock} from './warehouse-actions';

export default function WarehouseStockEditor({balance:fixedBalance,options=[],onSaved}:{balance?:WarehouseBalance;options?:WarehouseBalance[];onSaved:()=>void}) {
 const {company,setProcessing}=useCompany();
 const [selection,setSelection]=useState('');
 const [search,setSearch]=useState('');
 const balance=fixedBalance??options.find(b=>`${b.product_id}:${b.unit}`===selection);
 const [draft,setDraft]=useState<StockAdjustment|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 // Only the open editor owns the workspace navigation lock.
 useEffect(()=>{if(!draft)return;setProcessing(true);return()=>setProcessing(false);},[!!draft,setProcessing]);
 function close(){if(!busy){setDraft(null);setError('');}}
 async function save(){
  if(!draft||!balance||busy)return;
  setError('');
  let payload:StockAdjustment;
  try {
   payload=validateStockAdjustment(draft);
   if(new Decimal(payload.quantity).lt(balance.reserved))throw new Error('La existencia no puede ser menor que la cantidad asignada a OC.');
   if(new Decimal(payload.quantity).eq(payload.expected))throw new Error('Captura una cantidad distinta de la actual.');
  }catch(e){setError(e instanceof Error?e.message:'Revisa el ajuste.');return;}
  setBusy(true);
  try {
   if(!await confirmAction(`¿Cambiar la existencia de ${balance.sku} de ${draft.expected} a ${draft.quantity} ${draft.unit}? Se registrará el ajuste en la bitácora.`))return;
   const r=await adjustWarehouseStock(payload);
   if(!r.ok){setError(r.error);return;}
   setDraft(null);onSaved();
  }catch{setError('No se pudo confirmar el ajuste. Reintenta sin cerrar este formulario para evitar duplicarlo.');}
  finally{setBusy(false);}
 }
 function choose(b:WarehouseBalance){setSelection(`${b.product_id}:${b.unit}`);setDraft({id:crypto.randomUUID(),business_id:company.id,product_id:b.product_id,unit:b.unit,expected:b.quantity,quantity:b.quantity,reason:'Inventario físico inicial'});}
 const title=fixedBalance?'Editar stock':'Registrar inventario sin OC';
 const filtered=options.filter(b=>`${b.sku} ${b.description}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
 return <>
  <button type="button" className={fixedBalance?'client-secondary':'client-primary'} onClick={()=>{setError('');setSearch('');if(fixedBalance)choose(fixedBalance);else {setSelection('');setDraft({id:crypto.randomUUID(),business_id:company.id,product_id:'',unit:'',expected:'0',quantity:'',reason:'Inventario físico inicial'});}}}>{fixedBalance?<Pencil size={16}/>:<Plus size={18}/>}{fixedBalance?'Editar stock':'Registrar inventario'}</button>
  <CrudModal open={!!draft} className="product-dialog" labelledBy={`stock-title-${fixedBalance?.product_id??"new"}-${fixedBalance?.unit??"product"}`} onRequestClose={close}>
   <form onSubmit={e=>{e.preventDefault();void save();}}>
    <div className="crud-modal-heading"><h2 id={`stock-title-${fixedBalance?.product_id??"new"}-${fixedBalance?.unit??"product"}`}>{title}</h2><button type="button" className="icon-button" aria-label="Cerrar ajuste" disabled={busy} onClick={close}><X size={20}/></button></div>
    <div className="crud-modal-body">
     {error&&<p className="error" role="alert">{error}</p>}
     <p>{company.name} · Registro sin orden de compra.</p>
     {!fixedBalance&&draft&&<fieldset className="product-fields" disabled={busy}><div className="product-form-grid"><label className="product-wide">Buscar producto<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Código o descripción"/></label><label className="product-wide">Producto del catálogo<select required value={selection} onChange={e=>{const b=options.find(b=>`${b.product_id}:${b.unit}`===e.target.value);if(b)choose(b);}}><option value="" disabled>Selecciona un producto</option>{options.filter(b=>filtered.includes(b)||`${b.product_id}:${b.unit}`===selection).map(b=><option key={`${b.product_id}:${b.unit}`} value={`${b.product_id}:${b.unit}`}>{b.sku} · {b.description} · {b.unit}</option>)}</select></label></div><p>Si el producto aún no existe, dalo de alta en el catálogo Productos y actualiza Almacén.</p></fieldset>}
     {balance&&<p>{balance.sku} · {balance.description}</p>}
     {balance&&<p>Existencia actual: {balance.quantity} {balance.unit}. Asignada a OC: {balance.reserved}.</p>}
     {draft&&balance&&<fieldset className="product-fields" disabled={busy}><div className="product-form-grid">
      <label className="product-wide">Existencia física final ({balance.unit})<input required inputMode="decimal" maxLength={14} value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})}/><small>Captura el total contado, incluyendo las unidades asignadas a OC.</small></label>
      <label className="product-wide">Motivo del ajuste<textarea required rows={3} maxLength={1000} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
     </div></fieldset>}
    </div>
    <div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>Cancelar</button><button className="client-primary" disabled={busy||!balance}><Save size={17}/>{busy?'Guardando…':'Guardar ajuste'}</button></div>
   </form>
  </CrudModal>
 </>;
}
