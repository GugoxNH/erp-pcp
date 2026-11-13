"use client";
import {useState} from "react";
import {Link2,Plus,Save} from "lucide-react";
import CrudModal from "./crud-modal";
import {orderProductOptions,resolveOrderProduct} from "./order-actions";
import {unwrap} from "../lib/catalog-model";
import {missingOrderProducts,type OrderProduct} from "../lib/order-products";
import type {PurchaseOrderDraft} from "../lib/purchase-orders";
import {units} from "../lib/products";
import "./products.css";

export default function OrderProductDialog({draft,products:initial,canManage,onCancel,onComplete}:{draft:PurchaseOrderDraft;products:OrderProduct[];canManage:boolean;onCancel:()=>void;onComplete:()=>void}){
 const [products,setProducts]=useState(initial),[mode,setMode]=useState<"existing"|"new">("existing");
 const [search,setSearch]=useState(""),[selected,setSelected]=useState(""),[sku,setSku]=useState(""),[name,setName]=useState(""),[unit,setUnit]=useState("Pieza");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const missing=missingOrderProducts(draft.items,products),current=missing[0];
 const filtered=products.filter(p=>`${p.sku} ${p.name}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
 async function save(){
  if(busy||!current||!canManage)return;
  setBusy(true);setError("");
  try{
   unwrap(await resolveOrderProduct(draft.business_id,draft.client_id,current.code,mode==="existing"?selected:null,mode==="new"?{sku,name,unit}:null));
   const options=unwrap(await orderProductOptions(draft.business_id,draft.client_id));
   setProducts(options.products);setSelected("");setSearch("");setSku("");setName("");setMode("existing");
   if(!missingOrderProducts(draft.items,options.products).length)onComplete();
  }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo vincular el producto.");}
  finally{setBusy(false);}
 }
 return <CrudModal className="product-dialog order-product-dialog" labelledBy="order-product-title" onRequestClose={()=>{if(!busy)onCancel();}}>
  <form onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="crud-modal-heading"><h2 id="order-product-title">Relacionar refacción</h2></div>
   <div className="crud-modal-body">
   {current&&<><p><strong>Código del cliente: {current.code}</strong></p><p>Partidas {current.positions.join(", ")} · {current.description}</p><p>{missing.length} {missing.length===1?"código pendiente":"códigos pendientes"}</p></>}
   <p>Los productos y asociaciones se guardan en el catálogo, aunque después canceles la OC.</p>
   {!canManage?<p role="alert">Necesitas acceso a Productos para crear o asociar refacciones. Solicita apoyo a un administrador.</p>:<fieldset disabled={busy} className="product-fields">
    <div role="group" aria-label="Origen del producto" className="orders-actions">
     <button type="button" className={mode==="existing"?"client-primary":"client-secondary"} aria-pressed={mode==="existing"} onClick={()=>setMode("existing")}><Link2 size={16}/>Producto existente</button>
     <button type="button" className={mode==="new"?"client-primary":"client-secondary"} aria-pressed={mode==="new"} onClick={()=>{setMode("new");if(!name)setName(current?.description.slice(0,300)??"");}}><Plus size={16}/>Nuevo producto</button>
    </div>
    <div className="product-form-grid">
     {mode==="existing"?<><label className="product-wide">Buscar producto<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Código interno o descripción"/></label><label className="product-wide">Producto<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecciona un producto</option>{products.filter(p=>p.id===selected||filtered.includes(p)).map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label></>:<><label>Código interno<input required maxLength={80} value={sku} onChange={e=>setSku(e.target.value)}/></label><label>Unidad<select value={unit} onChange={e=>setUnit(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label><label className="product-wide">Descripción<input required maxLength={300} value={name} onChange={e=>setName(e.target.value)}/></label></>}
    </div>
   </fieldset>}
   {error&&<p className="error" role="alert">{error}</p>}
   </div>
   <div className="product-dialog-footer"><button type="button" className="client-secondary" disabled={busy} onClick={onCancel}>Volver a la OC</button><button className="client-primary" disabled={busy||!canManage||!current||(mode==="existing"&&!selected)}><Save size={16}/>{busy?"Guardando…":mode==="new"?"Crear y asociar":"Asociar producto"}</button></div>
  </form>
 </CrudModal>;
}
