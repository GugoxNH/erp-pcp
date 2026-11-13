"use client";
import {useEffect,useState} from "react";
import {Check,RefreshCw,Search} from "lucide-react";
import {useCompany} from "./workspace-shell";
import {completeService,listServices} from "./service-actions";
import {confirmAction} from "../lib/alerts";
import {statusLabels} from "../lib/purchase-orders";
import type {ServiceList,ServiceRow} from "../lib/services";
import "./products.css";
import "./orders.css";
import "./services.css";

function date(value:string|null){return value?value.split("-").reverse().join("/"):"—";}
export default function ServicesWorkspace(){
  const {company,setProcessing}=useCompany();
  const [data,setData]=useState<ServiceList>({rows:[],count:0});
  const [search,setSearch]=useState(""),[page,setPage]=useState(0),[reload,setReload]=useState(0);
  const [status,setStatus]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>{setProcessing(busy);return()=>setProcessing(false);},[busy,setProcessing]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");
    const timer=setTimeout(()=>{void listServices(company.id,search,page,status).then(result=>{
      if(!active)return;
      if(result.ok)setData(result.value);else {setError(result.error);setData({rows:[],count:0});}
      setLoading(false);
    }).catch(()=>{if(active){setError("No se pudo cargar el catálogo.");setLoading(false);setData({rows:[],count:0});}});},200);
    return()=>{active=false;clearTimeout(timer);};
  },[company.id,search,page,status,reload]);
  async function complete(row:ServiceRow){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      if(!await confirmAction(`¿Marcar como completado el servicio «${row.description}» de la OC ${row.order_number}? Se registrará la fecha actual de CDMX como fecha real del servicio.`))return;
      const result=await completeService(company.id,row.id,row.revision);
      if(!result.ok){setError(result.error);return;}
      setNotice(`Servicio completado. La OC muestra Realizado con fecha real ${date(result.value)}.`);
      setLoading(true);setReload(n=>n+1);
    }catch{setError("No se pudo completar el servicio. Intenta nuevamente.");}
    finally{setBusy(false);}
  }
  return <section className="orders-workspace">
    <header className="companies-heading"><div><p className="eyebrow">{company.name} / OPERACIÓN</p><h1>Servicios</h1></div></header>
    <p>Servicios registrados automáticamente desde las partidas de las órdenes de compra.</p>
    <div className="orders-toolbar services-toolbar"><label className="orders-search"><Search size={18}/><input aria-label="Buscar servicio, cliente u OC" placeholder="Buscar servicio, cliente u OC" disabled={busy} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><label className="services-status">Estatus<select value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Todos</option><option value="pending">Pendiente</option><option value="partial">En proceso</option><option value="complete">Completado</option></select></label><button className="icon-button" title="Actualizar servicios" aria-label="Actualizar servicios" disabled={loading||busy} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loading?<p role="status">Cargando servicios…</p>:<><div className="orders-table-scroll"><table className="orders-table"><thead><tr><th>OC / partida</th><th>Cliente</th><th>Servicio</th><th>Cantidad</th><th>Fecha programada</th><th>Estatus</th><th>Fecha real del servicio</th><th>Acciones</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}>
      <td>{row.order_number} · #{row.position}<small>{statusLabels[row.order_status]}</small></td><td>{row.client_name}</td><td>{row.description}</td><td>{row.quantity} {row.unit}</td><td>{date(row.commitment_date)}</td><td>{row.fulfillment==="complete"?"Completado":row.fulfillment==="partial"?"En proceso":"Pendiente"}</td><td>{date(row.completed_date)}</td><td>{row.order_status==="confirmed"&&row.fulfillment!=="complete"?<button className="client-primary" disabled={busy} onClick={()=>void complete(row)}><Check size={16}/>Marcar completado</button>:row.fulfillment==="complete"?"Realizado":row.order_status==="cancelled"?"OC cancelada":"OC en borrador"}</td>
    </tr>)}</tbody></table></div>{!data.rows.length&&!error&&<p>No hay servicios para mostrar.</p>}</>}
    <footer className="catalog-pagination"><span>{data.count} servicios</span><div><button className="client-secondary" disabled={busy||loading||page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1}</span><button className="client-secondary" disabled={busy||loading||(page+1)*25>=data.count} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></footer>
  </section>;
}
