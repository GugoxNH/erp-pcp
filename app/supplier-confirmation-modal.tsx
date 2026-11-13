"use client";
import {useEffect,useRef,useState} from 'react';
import {X,LoaderCircle} from 'lucide-react';
import CrudModal from './crud-modal';
import {getSupplierConfirmation,confirmSupplierPurchase,type SupplierConfirmation} from './supplier-confirmation-actions';
export default function SupplierConfirmationModal({business,purchase,onClose,onSaved}:{business:string;purchase:string;onClose:()=>void;onSaved:()=>void}){
 const [record,setRecord]=useState<SupplierConfirmation|null>(null),[value,setValue]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false);
 useEffect(()=>{let active=true;getSupplierConfirmation(business,purchase).then(r=>{if(!active)return;if(r.ok){setRecord(r.value);setLoading(false);}else setError(r.error);}).catch(()=>{if(active)setError('No se pudo consultar la confirmación. Cierra y vuelve a intentar.');});return()=>{active=false;};},[business,purchase]);
 function close(){if(!saving.current)onClose();}
 async function save(){if(saving.current||loading||record||!value.trim())return;saving.current=true;setBusy(true);setError('');try{const r=await confirmSupplierPurchase(business,purchase,value);if(!r.ok){setError(r.error);return;}setRecord(r.value);onSaved();}catch{setError('No se pudo guardar la confirmación. Intenta nuevamente.');}finally{saving.current=false;setBusy(false);}}
 return <CrudModal labelledBy="supplier-confirmation-title" onRequestClose={close}><form onSubmit={e=>{e.preventDefault();void save();}}>
  <div className="crud-modal-heading"><h2 id="supplier-confirmation-title">Confirmación del proveedor</h2><button type="button" className="icon-button" aria-label="Cerrar" disabled={busy} onClick={close}><X size={20}/></button></div>
  <div className="crud-modal-body">{error&&<p className="error" role="alert">{error}</p>}{loading&&!error&&<p role="status">Consultando confirmación…</p>}
   {record?<dl className="supplier-confirmation-details"><dt>Número de confirmación</dt><dd>{record.number}</dd><dt>Fecha de validación (CDMX)</dt><dd>{new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Mexico_City'}).format(new Date(record.date))}</dd></dl>:!loading&&<div className="product-form-grid"><label className="product-wide">Inserte numero de confirmación del proveedor<input required maxLength={200} value={value} disabled={busy} onChange={e=>setValue(e.target.value)}/></label></div>}
  </div><div className="crud-modal-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>{record?'Cerrar':'Cancelar'}</button>{!record&&<button className="client-primary" disabled={loading||busy||!value.trim()}>{busy&&<LoaderCircle className="email-spinner" size={16}/>} {busy?'Validando…':'Validar'}</button>}</div>
 </form></CrudModal>;
}
