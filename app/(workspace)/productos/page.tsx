"use client";
import CrudModal from "../../crud-modal";
import {listProductSuppliers} from "../../supplier-actions";
import type {SupplierOption} from "../../../lib/suppliers";
import {alerts,showActionError} from "../../../lib/alerts";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Package, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { blankProduct, units, type Product, type ProductClientOption } from "../../../lib/products";
import { listProducts, saveProduct, deleteProduct, listProductClients } from "../../product-actions";
import { useCompany } from "../../workspace-shell";
import "../../products.css";

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]), [search, setSearch] = useState(""), [status, setStatus] = useState("all");
  const [page, setPage] = useState(1), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [clients, setClients] = useState<ProductClientOption[]>([]);
  const [suppliers,setSuppliers] = useState<SupplierOption[]>([]);
  const { setProcessing } = useCompany();
  async function refresh() {
    setLoading(true); setError("");
    try { const result = await listProducts(); const options = await listProductClients(); const providers = await listProductSuppliers(); if (result.ok && options.ok && providers.ok) { setRows(result.value); setClients(options.value); setSuppliers(providers.value); } else setError(!result.ok ? result.error : !options.ok ? options.error : !providers.ok ? providers.error : ""); }
    catch { setError("No se pudo conectar. Intenta nuevamente."); } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { setProcessing(busy || !!draft); return () => setProcessing(false); }, [busy, draft, setProcessing]);

  const filtered = rows.filter(p => (status === "all" || p.active === (status === "active")) && `${p.sku} ${p.name} ${p.brand} ${p.model} ${p.category} ${p.client_codes.map(c => `${c.code} ${clients.find(client => client.id === c.client_id)?.name ?? ""}`).join(" ")}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
  const pages = Math.max(1, Math.ceil(filtered.length / 15)), current = Math.min(page, pages);
  function close() { if (busy) return; setDraft(null); setError(""); }
  async function remove(product:Product) {
    if(busy)return;
    setBusy(true);
    try {
      const result=await alerts.fire({titleText:`¿Eliminar ${product.sku} · ${product.name}?`,
        text:"Esta acción no se puede deshacer.",icon:"warning",showCancelButton:true,
        confirmButtonText:"Eliminar producto",focusCancel:true,showLoaderOnConfirm:true,
        allowOutsideClick:()=>!alerts.isLoading(),allowEscapeKey:()=>!alerts.isLoading(),
        preConfirm:async()=>{try{const response=await deleteProduct(product.id,product.updated_at);if(!response.ok)throw new Error(response.error);return true;}catch(error){showActionError(error);return false;}}
      });
      if(result.isConfirmed){setRows(old=>old.filter(p=>p.id!==product.id));setNotice("Producto eliminado.");}
    }finally{setBusy(false);}
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await saveProduct(draft!);
      if (!result.ok) { setError(result.error); return; }
      { const saved = result.value as Product; setRows(old => [...old.filter(p => p.id !== saved.id), saved].sort((a,b) => a.sku.localeCompare(b.sku))); }
      setNotice("Producto guardado."); setDraft(null);
    } catch { setError("No se pudo conectar. Tus cambios siguen en el formulario."); } finally { setBusy(false); }
  }
  return <section className="products-workspace">
    <div className="companies-heading"><div><p className="eyebrow">CATÁLOGO COMPARTIDO</p><h1>Productos</h1></div><button className="client-primary" disabled={loading} onClick={() => { setError(""); setNotice(""); setDraft(blankProduct()); }}><Plus size={18}/>Nuevo producto</button></div>
    {error && !draft && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="products-toolbar"><label className="products-search"><Search size={18}/><input aria-label="Buscar productos" placeholder="Buscar código, descripción, marca o modelo" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></label><label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button className="icon-button" title="Actualizar catálogo" aria-label="Actualizar catálogo" disabled={loading} onClick={refresh}><RefreshCw size={18}/></button></div>
    <div className="products-table"><table><thead><tr><th>Código / descripción</th><th>Códigos del cliente</th><th>Proveedores</th><th>Categoría</th><th>Marca / modelo</th><th>Unidad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{!loading && filtered.slice((current-1)*15,current*15).map(p => <tr key={p.id}><td><strong>{p.sku}</strong><span>{p.name}</span></td><td>{p.client_codes.map(c => <span key={`${c.client_id}:${c.code}`}>{clients.find(client => client.id === c.client_id)?.name ?? c.client_id}: <strong>{c.code}</strong></span>)}{!p.client_codes.length && "—"}</td><td>{p.supplier_ids.map(id=><span key={id}>{suppliers.find(s=>s.id===id)?.name ?? id}{p.supplier_codes[id] && <>: <strong>{p.supplier_codes[id]}</strong></>}</span>)}{!p.supplier_ids.length && "—"}</td><td>{p.category || "—"}</td><td>{p.brand || "—"}<span>{p.model}</span></td><td>{p.unit}</td><td><span className={`product-status ${p.active ? "active" : ""}`}>{p.active ? "Activo" : "Inactivo"}</span></td><td><div className="product-row-actions"><button className="icon-button" title={`Editar ${p.sku}`} aria-label={`Editar ${p.sku}`} onClick={() => { setError(""); setDraft({...p}); }}><Pencil size={17}/></button><button className="icon-button" title={`Eliminar ${p.sku}`} aria-label={`Eliminar ${p.sku}`} disabled={busy} onClick={() => void remove(p)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>
    {(loading || !filtered.length) && <div className="products-empty"><Package size={30}/><p>{loading ? "Cargando productos…" : search || status !== "all" ? "No hay productos que coincidan" : "Aún no hay productos registrados"}</p></div>}
    <div className="products-pagination"><span>{filtered.length} productos</span><button className="icon-button" aria-label="Página anterior" title="Página anterior" disabled={current<=1} onClick={() => setPage(current-1)}><ChevronLeft size={18}/></button><span>{current} / {pages}</span><button className="icon-button" aria-label="Página siguiente" title="Página siguiente" disabled={current>=pages} onClick={() => setPage(current+1)}><ChevronRight size={18}/></button></div>
    <CrudModal open={!!draft} className="product-dialog" labelledBy="product-title" onRequestClose={() => { close(); }}>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="product-dialog-heading"><h2 id="product-title">{draft?.id ? "Editar producto" : "Nuevo producto"}</h2><button type="button" className="icon-button" aria-label="Cerrar formulario" title="Cerrar" disabled={busy} onClick={close}><X size={20}/></button></div>
      <div className="crud-modal-body">
      {error && <p role="alert" className="error">{error}</p>}
      {draft && <fieldset disabled={busy} className="product-fields"><div className="product-form-grid">{([['sku','Código interno',80],['name','Descripción',300],['category','Categoría',100],['brand','Marca',100],['model','Modelo',100]] as const).map(([key,label,max]) => <label key={key} className={key==='name' ? 'product-wide' : ''}>{label}<input required={key==='sku'||key==='name'} maxLength={max} value={draft[key]} onChange={e => setDraft({...draft,[key]:e.target.value})}/></label>)}<label>Unidad<select value={draft.unit} onChange={e => setDraft({...draft,unit:e.target.value})}>{units.map(u => <option key={u}>{u}</option>)}</select></label><label className="product-wide">Notas<textarea maxLength={2000} rows={3} value={draft.notes} onChange={e => setDraft({...draft,notes:e.target.value})}/></label><label className="product-active"><input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft,active:e.target.checked})}/>Producto activo</label></div><section className="product-client-codes"><h3>Códigos del cliente</h3>{draft.client_codes.map((row,index) => <div className="product-code-row" key={index}><label>Cliente<select required aria-label={`Cliente del código ${index + 1}`} value={row.client_id} onChange={e => setDraft({...draft,client_codes:draft.client_codes.map((c,i) => i===index ? {...c,client_id:e.target.value} : c)})}><option value="">Selecciona un cliente</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (Inactivo)" : ""}</option>)}</select></label><label>Código del cliente<input required maxLength={80} aria-label={`Código del cliente ${index + 1}`} value={row.code} onChange={e => setDraft({...draft,client_codes:draft.client_codes.map((c,i) => i===index ? {...c,code:e.target.value} : c)})}/></label><button type="button" className="icon-button" title="Quitar código" aria-label={`Quitar código ${index + 1}`} onClick={() => setDraft({...draft,client_codes:draft.client_codes.filter((_,i) => i!==index)})}><Trash2 size={17}/></button></div>)}<button type="button" className="client-secondary" disabled={!clients.length} onClick={() => setDraft({...draft,client_codes:[...draft.client_codes,{client_id:"",code:""}]})}><Plus size={17}/>Agregar código de cliente</button></section></fieldset>}
      {draft && <fieldset disabled={busy} className="product-fields"><section className="product-client-codes"><h3>Proveedores</h3>{draft.supplier_ids.map((id,index)=><div className="product-supplier-row" key={index}><label>Proveedor {index+1}<select required value={id} onChange={e=>setDraft({...draft,supplier_ids:draft.supplier_ids.map((value,i)=>i===index?e.target.value:value)})}><option value="">Selecciona un proveedor</option>{suppliers.filter(s=>s.id===id||(s.active&&!draft.supplier_ids.includes(s.id))).map(s=><option key={s.id} value={s.id}>{s.name}{s.active?"":" (Inactivo)"}</option>)}</select></label><label>Código del proveedor (opcional)<input maxLength={80} value={draft.supplier_codes[id] ?? ""} disabled={!id} onChange={e=>setDraft({...draft,supplier_codes:{...draft.supplier_codes,[id]:e.target.value}})}/></label><button type="button" className="icon-button" title="Quitar proveedor" aria-label={`Quitar proveedor ${index+1}`} onClick={()=>setDraft({...draft,supplier_ids:draft.supplier_ids.filter((_,i)=>i!==index)})}><Trash2 size={17}/></button></div>)}<button type="button" className="client-secondary" disabled={!suppliers.some(s=>s.active&&!draft.supplier_ids.includes(s.id))||draft.supplier_ids.includes("")} onClick={()=>setDraft({...draft,supplier_ids:[...draft.supplier_ids,""]})}><Plus size={17}/>Agregar proveedor</button>{!suppliers.length&&<p>No hay proveedores registrados.</p>}</section></fieldset>}
      </div>
      <div className="product-dialog-footer"><button type="button" className="client-secondary" disabled={busy} onClick={close}>Cancelar</button><button className="client-primary" disabled={busy}><Save size={17}/> {busy ? "Procesando…" : "Guardar producto"}</button></div></form>
    </CrudModal>
  </section>;
}
