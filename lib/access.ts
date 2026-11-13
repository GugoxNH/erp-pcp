export const sections = [
  { id: "dashboard", label: "Dashboard", path: "/" },
  { id: "businesses", label: "Mis empresas", path: "/mis-empresas" },
  { id: "clients", label: "Clientes", path: "/clientes" },
  { id: "orders", label: "Órdenes de compra", path: "/orden-de-compra" },
  { id: "services", label: "Servicios", path: "/servicios" },
  { id: "purchases", label: "Compras a proveedores", path: "/compras" },
  { id: "warehouse", label: "Almacén", path: "/almacen" },
  { id: "products", label: "Productos", path: "/productos" },
  { id: "suppliers", label: "Proveedores", path: "/proveedores" },
  { id: "users", label: "Usuarios", path: "/usuarios" },
  { id: "audit", label: "Bitácora", path: "/bitacora" },
] as const;
export const permissions = [{id:"edit_warehouse",label:"Editar almacen"},{id:"edit_users",label:"Edición de usuarios"},{id:"edit_orders",label:"Editar ordenes de compras"}] as const;
export type Permission = typeof permissions[number]["id"];
export function hasPermission(profile:AccessProfile|null, permission:Permission){return !!profile?.active&&(profile.is_developer||profile[permission]===true);}
export type Section = typeof sections[number]["id"];
export type AccessProfile = { user_id: string; username: string; full_name: string; sections: Section[]; edit_warehouse?: boolean; edit_users?: boolean; edit_orders?: boolean; active: boolean; is_developer: boolean; updated_at: string };
export type UserAccount = AccessProfile & { email: string };
export function validateEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(".invalid")) throw new Error("Introduce un correo electrónico válido.");
  return email;
}
export function canAccess(profile: AccessProfile | null, section: Section) { return !!profile?.active && (profile.is_developer || profile.sections.includes(section)); }
export function firstPath(profile: AccessProfile) { return sections.find(s => canAccess(profile, s.id))?.path ?? "/login?error=access"; }
export function validateAccount(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Usuario no válido.");
  const v = input as Record<string, unknown>;
  const username = typeof v.username === "string" ? v.username.trim().toLowerCase() : "";
  const full_name = typeof v.full_name === "string" ? v.full_name.trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw new Error("El usuario debe tener de 3 a 40 letras sin acentos, números, puntos, guiones o guiones bajos.");
  if (!full_name || full_name.length > 160) throw new Error("Introduce el nombre completo (máximo 160 caracteres).");
  if (!Array.isArray(v.sections) || !v.sections.length || v.sections.length > sections.length || v.sections.some(s => !sections.some(item => item.id === s)) || new Set(v.sections).size !== v.sections.length) throw new Error("Selecciona al menos un acceso válido.");
  if (typeof v.active !== "boolean") throw new Error("Estado no válido.");
  if (v.edit_warehouse !== undefined && typeof v.edit_warehouse !== "boolean") throw new Error("Permiso no válido.");
  if (v.edit_users !== undefined && typeof v.edit_users !== "boolean") throw new Error("Permiso no válido.");
  if (v.edit_orders !== undefined && typeof v.edit_orders !== "boolean") throw new Error("Permiso no válido.");
  return { edit_orders: v.edit_orders === true, edit_users: v.edit_users === true, edit_warehouse: v.edit_warehouse === true, username, full_name, sections: v.sections as Section[], active: v.active };
}
