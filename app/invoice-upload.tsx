"use client";
import {useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Upload,FileText,X} from 'lucide-react';
import CrudModal from './crud-modal';
import {parseInvoiceXml,type InvoiceFields,type InvoicePreview} from '../lib/invoice-xml';
import './invoice-preview.css';
const labels:Record<string,string>={Version:'Versión CFDI',Serie:'Serie',Folio:'Folio',Fecha:'Fecha de emisión',SubTotal:'Subtotal',Total:'Total',Moneda:'Moneda',TipoCambio:'Tipo de cambio',Descuento:'Descuento',TipoDeComprobante:'Tipo de comprobante',MetodoPago:'Método de pago',FormaPago:'Forma de pago',CondicionesDePago:'Condiciones de pago',LugarExpedicion:'CP de expedición',Exportacion:'Exportación',NoCertificado:'Certificado del emisor',Rfc:'RFC',Nombre:'Nombre / razón social',RegimenFiscal:'Régimen fiscal',RegimenFiscalReceptor:'Régimen fiscal',DomicilioFiscalReceptor:'CP fiscal',UsoCFDI:'Uso del CFDI',FechaTimbrado:'Fecha de timbrado',RfcProvCertif:'RFC del certificador',NoCertificadoSAT:'Certificado SAT',ClaveProdServ:'Clave SAT producto / servicio',NoIdentificacion:'Código del proveedor',Cantidad:'Cantidad',ClaveUnidad:'Clave SAT unidad',Unidad:'Unidad',Descripcion:'Descripción',ValorUnitario:'Precio unitario',Importe:'Importe',ObjetoImp:'Objeto de impuesto',Impuesto:'Impuesto (clave SAT)',TipoFactor:'Tipo de factor',TasaOCuota:'Tasa / cuota',TotalImpuestosTrasladados:'Total de impuestos trasladados',TotalImpuestosRetenidos:'Total de impuestos retenidos',TipoRelacion:'Tipo de relación'};
function value(key:string,v:string){if(['Fecha','FechaTimbrado'].includes(key)&&/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10).split('-').reverse().join('/')+' '+v.slice(11);return v;}
function Fields({data}:{data:InvoiceFields}){return <dl className="invoice-fields">{Object.entries(data).map(([k,v])=><div key={k}><dt>{labels[k]??k}</dt><dd>{value(k,v)||'No indicado'}</dd></div>)}</dl>;}
export default function InvoiceUpload({context}:{context:string}){
 const input=useRef<HTMLInputElement>(null),title=useId();
 const [invoice,setInvoice]=useState<InvoicePreview|null>(null),[name,setName]=useState(''),[open,setOpen]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState('');
 async function read(file:File){setReading(true);setError('');try{
  if(!/\.xml$/i.test(file.name))throw new Error('Selecciona un archivo .xml.');
  if(file.size>5*1024*1024)throw new Error('El archivo supera el límite de 5 MB.');
  const bytes=await file.arrayBuffer();
  const declaration=new TextDecoder().decode(bytes.slice(0,200));
  const encoding=declaration.match(/encoding\s*=\s*["']([^"']+)/i)?.[1]??'utf-8';
  const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
  const parsed=parseInvoiceXml(text);setInvoice(parsed);setName(file.name);setOpen(true);
 }catch(e){setError(e instanceof Error?e.message:'No se pudo leer el XML.');}finally{setReading(false);}}
 return <div className="invoice-upload product-wide">
  <div className="invoice-upload-actions"><button type="button" className="client-secondary" disabled={reading} onClick={()=>input.current?.click()}><Upload size={17}/>{reading?'Leyendo XML…':'Subir factura'}</button>{invoice&&<button type="button" className="client-secondary" onClick={()=>setOpen(true)}><FileText size={17}/>Ver factura</button>}</div>
  <input ref={input} type="file" accept=".xml,application/xml,text/xml" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void read(file);}}/>
  <small>Vista previa del XML · hasta 5 MB · sin guardar en la base de datos.</small>
  {name&&<p>{name}</p>}{error&&<p className="error" role="alert">{error}</p>}
  {open&&invoice&&createPortal(<CrudModal open className="invoice-dialog" labelledBy={title} onRequestClose={()=>setOpen(false)}>
   <div className="crud-modal-heading"><div><p className="eyebrow">REVISIÓN DE FACTURA XML</p><h2 id={title}>{[invoice.header.Serie,invoice.header.Folio].filter(Boolean).join(' ')||'Factura sin folio en XML'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar revisión de factura" onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <div className="crud-modal-body">
    <p>{context} · {name}</p><p className="invoice-info">Solo revisión. El XML permanece en memoria mientras este formulario esté abierto. No se guarda ni se vincula al movimiento y no cambia existencias. Importes en {invoice.header.Moneda||'moneda no indicada'}, sin conversión. Lectura del XML, sin validación fiscal ante el SAT.</p>
    {invoice.warnings.length>0&&<div className="invoice-warning" role="status"><strong>Datos para revisar</strong><ul>{invoice.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
    <h3>Resumen del comprobante</h3><Fields data={invoice.header}/>
    <div className="invoice-parties"><section><h3>Emisor</h3><Fields data={invoice.issuer}/></section><section><h3>Receptor</h3><Fields data={invoice.receiver}/></section></div>
    <p>Comprueba que emisor, receptor y moneda correspondan a la empresa y a la compra u OC seleccionada. Los códigos y conceptos del XML no se relacionan automáticamente con productos del catálogo ni implican movimientos de almacén.</p>
    <h3>Conceptos ({invoice.concepts.length})</h3>{invoice.concepts.map((c,i)=><section className="invoice-concept" key={i}><h4>Concepto {i+1} · {c.fields.Descripcion}</h4><Fields data={Object.fromEntries(Object.entries(c.fields).filter(([k])=>k!=='Descripcion'))}/>{c.taxes.length>0&&<details><summary>Impuestos del concepto ({c.taxes.length})</summary>{c.taxes.map((t,j)=><Fields key={j} data={t}/>)}</details>}</section>)}
    <h3>Impuestos del comprobante</h3><Fields data={invoice.taxTotals}/>{invoice.taxes.map((t,i)=><Fields data={t} key={i}/>)}{!invoice.taxes.length&&<p>No se declararon impuestos globales desglosados.</p>}
    <h3>Identificación y timbrado</h3><Fields data={invoice.stamp}/>{!invoice.stamp.UUID&&<p>Sin UUID.</p>}
    {invoice.related.length>0&&<><h3>CFDI relacionados</h3>{invoice.related.map((r,i)=><Fields key={i} data={r}/>)}</>}
   </div><div className="crud-modal-footer"><button type="button" className="client-primary" onClick={()=>setOpen(false)}>Volver al movimiento</button></div>
  </CrudModal>,document.body)}
 </div>;
}
