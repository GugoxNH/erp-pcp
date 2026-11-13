import { ChartNoAxesCombined, ClipboardList, CircleDollarSign, ShoppingCart, Warehouse, Wrench } from "lucide-react";
import "./auth.css";

const modules = [
  [ClipboardList, "Órdenes", "Producción y cobro"],
  [Wrench, "Servicios", "Control de operaciones"],
  [ShoppingCart, "Compras", "Abastecimiento"],
  [CircleDollarSign, "Finanzas", "Gestión financiera"],
  [Warehouse, "Almacén", "Inventario en tiempo real"],
  [ChartNoAxesCombined, "Indicadores", "Información para decidir"],
] as const;

export default function AuthFrame({ children }: { children: React.ReactNode }) {
  const date = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date());
  return <main className="auth-screen">
    <section className="auth-brand-panel" aria-label="PCP, Procesos de Control y Pesaje">
      <img className="auth-industry" src="/brands/login-industry.png" alt="" />
      <div className="auth-brand-content">
        <img className="auth-brand-logo" src="/brands/pcp.png" alt="PCP, Procesos de Control y Pesaje" width={340} height={114} />
        <div className="auth-brand-message"><span className="auth-rule" /><h2>Control integral<br />de tu operación</h2><p>Un ERP diseñado para impulsar la eficiencia de tu empresa, desde la producción hasta la toma de decisiones.</p></div>
        <div className="auth-modules">{modules.map(([Icon, title, subtitle]) => <div className="auth-module" key={title}><span className="auth-module-icon"><Icon size={25} strokeWidth={1.5} /></span><div><strong>{title}</strong><small>{subtitle}</small></div></div>)}</div>
        <p className="auth-motto"><span className="auth-rule" />Pesamos el progreso de tu empresa</p>
      </div>
    </section>
    <section className="auth-form-panel" aria-label="Acceso al sistema">
      <div className="auth-welcome"><strong>Bienvenido a PCP</strong><span>{date}</span></div>
      <div className="auth-form-card"><img className="auth-form-logo" src="/brands/pcp.png" alt="PCP" width={205} height={69} />{children}<div className="auth-form-bottom" /></div>
      <p className="auth-copyright">PCP · Procesos de Control y Pesaje</p>
    </section>
  </main>;
}
