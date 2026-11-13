"use client";
import {useId,useState} from "react";
import type {PurchaseOptions} from "../lib/purchases";

type Product = PurchaseOptions["products"][number];
export default function PurchaseProductSearch({products,supplierId,value,description,disabled,onSelect}:{products:Product[];supplierId:string;value:string;description:string;disabled:boolean;onSelect:(product:Product)=>Promise<void>}) {
 const id=useId();
 const [query,setQuery]=useState<string|null>(null),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[selecting,setSelecting]=useState(false);
 const selected=products.find(p=>p.id===value);
 const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").trim();
 const eligible=products.filter(p=>p.supplier_ids.includes(supplierId));
 const matches=eligible.filter(p=>normalize(p.sku+" "+p.name).includes(normalize(query??"")));
 const label=selected?selected.sku+" · "+selected.name:description;
 const locked=disabled||!supplierId||selecting;
 async function select(product:Product){if(locked)return;setSelecting(true);try{await onSelect(product);setQuery(null);setOpen(false);setActive(-1);}finally{setSelecting(false);}}
 return <div className="product-wide purchase-product-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery(null);setActive(-1);}}}>
  <label htmlFor={id}>Producto *</label>
  <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open&&!locked} aria-controls={id+"-results"} aria-activedescendant={open&&active>=0?id+"-"+active:undefined} autoComplete="off" disabled={locked} value={query??label} placeholder={supplierId?"Buscar código o descripción":"Selecciona primero un proveedor"} onFocus={()=>{setOpen(true);setActive(-1);}} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={e=>{
   if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);setActive(n=>Math.min(n+1,matches.length-1));}
   if(e.key==="ArrowUp"){e.preventDefault();setActive(n=>Math.max(0,n-1));}
   if(e.key==="Escape"&&open){e.preventDefault();e.stopPropagation();setOpen(false);setQuery(null);}
   if(e.key==="Enter"){e.preventDefault();if(open&&active>=0&&matches[active])void select(matches[active]);}
  }}/>
  {open&&!locked&&<div className="purchase-product-results" id={id+"-results"} role="listbox" aria-label="Productos del proveedor">
   {matches.map((p,index)=><button type="button" role="option" id={id+"-"+index} aria-selected={active===index} key={p.id} onMouseDown={e=>e.preventDefault()} onClick={()=>void select(p)}><strong>{p.sku}</strong><span>{p.name}</span></button>)}
   {!matches.length&&<p role="status">{eligible.length?"Sin coincidencias":"Este proveedor no tiene productos activos asociados"}</p>}
  </div>}
  {!disabled&&value&&supplierId&&!eligible.some(p=>p.id===value)&&<p className="error">El producto ya no está disponible para este proveedor. Selecciona otro.</p>}
 </div>;
}
