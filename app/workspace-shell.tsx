"use client";
import CrudModal from "./crud-modal";
import { createContext, useActionState, useContext, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Building2, ChevronLeft, ChevronRight, FileText, LayoutDashboard, LogOut, Menu, Package, Users, ShieldCheck, X } from "lucide-react";
import { logout } from "./auth/actions";
import { businesses, type Business } from "../lib/businesses";
import { canAccess, sections, type AccessProfile } from "../lib/access";
const sectionIcons = { dashboard: LayoutDashboard, businesses: Building2, clients: Users, orders: FileText, services: FileText, purchases: Package, warehouse: Package, products: Package, suppliers: Building2, users: ShieldCheck, audit: FileText };

const CompanyContext = createContext<{company:Business;access:AccessProfile;setProcessing:Dispatch<SetStateAction<boolean>>}|null>(null);
export function useCompany() {
  const context = useContext(CompanyContext);
  if(!context)throw new Error("Company context unavailable");
  return context;
}

export default function WorkspaceShell({children,userEmail,access}:{children:ReactNode;userEmail:string;access:AccessProfile}) {
  const [logoutState,logoutAction,loggingOut] = useActionState(logout, {});
  const [company,setCompany] = useState<Business>(businesses[0]);
  const [processing,setProcessing] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [mobileOpen,setMobileOpen] = useState(false);
  const [companyOpen,setCompanyOpen]=useState(false);
  const pathname = usePathname();
  const currentSection = pathname==='/perfil'?{label:'Perfil'}:sections.find(s => s.path === pathname);
  useEffect(()=>{
    try {const saved=localStorage.getItem("warehouse.company.v1");const found=businesses.find(b=>b.id===saved);if(found)setCompany(found);}catch{}
  },[]);
  function chooseCompany(next:Business) {
    setCompany(next);
    try {localStorage.setItem("warehouse.company.v1",next.id);}catch{}
    setCompanyOpen(false);setMobileOpen(false);
  }
  return <CompanyContext.Provider value={{company,access,setProcessing}}>
    <CrudModal open={companyOpen} className="company-dialog" labelledBy="company-dialog-title" onRequestClose={()=>setCompanyOpen(false)}>
      <div className="crud-modal-heading"><h2 id="company-dialog-title">Cambiar de empresa</h2><button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={()=>setCompanyOpen(false)}><X size={20}/></button></div>
      <div className="crud-modal-body company-options">{businesses.filter(b=>b.id!==company.id).map(b=><button key={b.id} type="button" className="company-option" aria-label={`Seleccionar ${b.name}`} onClick={()=>chooseCompany(b)}><span className="company-option-image"><img src={b.logo} alt={b.name} width={210} height={90}/></span><span>{b.name}<ChevronRight size={16}/></span></button>)}</div>
    </CrudModal>
    <div className={`dashboard-shell ${collapsed?"sidebar-collapsed":""} ${mobileOpen?"mobile-menu-open":""}`}>
      {mobileOpen&&<button className="mobile-shade" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)}/>}
      <aside className="dashboard-sidebar" aria-label="Menú principal">
        <button className="company-logo" disabled={processing} title={`Cambiar de empresa: ${company.name}`} aria-label={`Cambiar de empresa: ${company.name}`} onClick={()=>setCompanyOpen(true)}>
          <img src={company.logo} alt={company.name} width={180} height={66}/><ArrowLeftRight size={15} className="switch-company-icon"/>
        </button>
        <button className="sidebar-toggle" aria-label={collapsed?"Expandir menú":"Contraer menú"} title={collapsed?"Expandir menú":"Contraer menú"} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}</button>
        <nav className="dashboard-nav">
          {sections.filter(s => canAccess(access,s.id)).map(s => { const Icon=sectionIcons[s.id]; return <Link key={s.id} href={s.path} className={pathname===s.path?"selected":""} aria-current={pathname===s.path?"page":undefined} title={s.label} onClick={e=>{if(processing)e.preventDefault();else setMobileOpen(false);}} aria-disabled={processing}><Icon size={19}/><span>{s.label}</span></Link>; })}
        </nav>
        <div className="sidebar-company"><span>RAZÓN SOCIAL</span><strong>{company.name}</strong></div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <button className="mobile-menu-button icon-button" aria-label="Abrir menú" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button>
          <div className="breadcrumbs"><span>Inicio</span>{currentSection && pathname!=="/" && <><ChevronRight size={14}/><strong>{currentSection.label}</strong></>}</div>
          <div className="workspace-account"><span className="active-company" aria-live="polite">{company.name}</span><Link href="/perfil" className="workspace-email workspace-profile" title="Abrir mi perfil" aria-label={`Abrir perfil de ${userEmail}`} aria-current={pathname==='/perfil'?'page':undefined} aria-disabled={processing} onClick={e=>{if(processing)e.preventDefault();else setMobileOpen(false);}}>{userEmail}</Link><form action={logoutAction}><button type="submit" className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={processing||loggingOut}><LogOut size={19}/></button></form></div>
        </header>
        {logoutState.error&&<p role="alert" className="error">{logoutState.error}</p>}
        <main className="dashboard-content" key={company.id}>{children}</main>
      </div>
    </div>
  </CompanyContext.Provider>;
}
