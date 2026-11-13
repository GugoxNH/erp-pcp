import Link from "next/link";
import {requireAccess} from "../../../lib/access-server";
import "../../orders.css";
export default async function AuditPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const {db}=await requireAccess("audit");
 const params=await searchParams;
 const page=Math.max(0,Math.min(100000,Number.parseInt(params.page??"0",10)||0));
 const {data,count,error}=await db.from("activity_log").select("*",{count:"exact"}).order("occurred_at",{ascending:false}).order("id").range(page*25,page*25+24);
 return <div className="orders-workspace"><header className="companies-heading"><h1>Bitácora</h1></header>{error?<p role="alert">No se pudo cargar la bitácora. Intenta nuevamente.</p>:<><div className="orders-table-scroll"><table className="orders-table"><thead><tr><th>Fecha y hora (CDMX)</th><th>Usuario</th><th>Razón social</th><th>Acción</th></tr></thead><tbody>{data?.map(row=><tr key={row.id}><td>{new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Mexico_City'}).format(new Date(row.occurred_at))}</td><td>{row.actor_name}<small>@{row.actor_username}</small></td><td>{row.business_id==='jose'?'José Orozco':row.business_id.toUpperCase()}</td><td className="audit-action">{row.action==='purchase_order.deleted' ? `Eliminó la OC con el número ${row.entity_label || 'no disponible'} del cliente ${row.details?.client || 'no disponible'}.` : row.details?.description || row.action}</td></tr>)}</tbody></table></div>{!data?.length&&<p>No hay acciones registradas.</p>}<footer className="catalog-pagination"><span>{count??0} acciones</span><div>{page>0&&<Link href={`/bitacora?page=${page-1}`}>Anterior</Link>}<span>Página {page+1}</span>{(page+1)*25<(count??0)&&<Link href={`/bitacora?page=${page+1}`}>Siguiente</Link>}</div></footer></>}</div>;
}
