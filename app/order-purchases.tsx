"use client";
import {useEffect,useState} from "react";
import {orderPurchaseAssignments,type OrderPurchaseAssignment} from "./purchase-actions";
import {purchaseStatuses} from "../lib/purchases";
export default function OrderPurchases({business,id}:{business:string;id:string}){
 const [rows,setRows]=useState<OrderPurchaseAssignment[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void orderPurchaseAssignments(business,id).then(r=>{if(active){if(r.ok)setRows(r.value);else setError(r.error);setLoading(false);}}).catch(()=>{if(active){setError('No se pudieron consultar las compras.');setLoading(false);}});return()=>{active=false;};},[business,id]);
 return <section className="order-file"><h2>Compras asignadas</h2>{error&&<p className="error" role="alert">{error}</p>}{loading?<p>Cargando compras…</p>:!rows.length?<p>Sin compras asignadas.</p>:<div className="products-table"><table><thead><tr><th>Partida</th><th>Compra</th><th>Proveedor</th><th>Cantidad asignada</th><th>Estado</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.item_id}-${i}`}><td>{r.position}</td><td>{r.purchase_number}</td><td>{r.supplier}</td><td>{r.quantity} {r.unit}</td><td>{purchaseStatuses[r.status]}</td></tr>)}</tbody></table></div>}</section>;
}
