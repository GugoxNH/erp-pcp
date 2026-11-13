export const supplierFields = [
  ["name", "Nombre comercial", 200], ["legal_name", "Razón social", 300],
  ["rfc", "RFC", 13], ["contact_name", "Persona de contacto", 160],
  ["email", "Correo electrónico", 254], ["phone", "Teléfono fijo", 40],
  ["mobile", "Teléfono celular", 40], ["address", "Domicilio", 600],
  ["notes", "Observaciones", 2000],
] as const;
type SupplierField = typeof supplierFields[number][0];
export const supplierContactFields = [["name","Nombre del contacto",160],["position","Puesto",160],["email","Correo electrónico",254],["mobile","Teléfono celular",40]] as const;
export type SupplierContact = {id:string; name:string; position:string; email:string; mobile:string};
export type Supplier = Record<SupplierField, string> & {id:string; active:boolean; updated_at:string; contacts:SupplierContact[]};
export type SupplierOption = Pick<Supplier,"id"|"name"|"active">;
export function blankSupplier():Supplier { return {id:"", name:"", legal_name:"", rfc:"", contact_name:"", email:"", phone:"", mobile:"", address:"", notes:"", active:true, updated_at:"", contacts:[]}; }
export function validateSupplier(input:unknown) {
  if (!input || typeof input !== "object") throw new Error("Proveedor no válido.");
  const value = input as Record<string,unknown>;
  const clean = {} as Record<SupplierField,string>;
  for (const [key,label,max] of supplierFields) {
    if (typeof value[key] !== "string" || value[key].trim().length > max) throw new Error(`Revisa ${label}.`);
    clean[key] = value[key].trim();
  }
  if (!clean.name) throw new Error("El nombre del proveedor es obligatorio.");
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error("Introduce un correo válido.");
  if (clean.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(clean.rfc.toUpperCase())) throw new Error("Revisa el RFC.");
  if (typeof value.active !== "boolean") throw new Error("Estado no válido.");
  if (!Array.isArray(value.contacts)) throw new Error("Revisa los contactos del proveedor.");
  const ids = new Set<string>();
  const contacts = value.contacts.map((entry,index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Contacto no válido.");
    const row = entry as Record<string,unknown>;
    if (typeof row.id !== "string" || !row.id.trim() || row.id.length > 80 || ids.has(row.id)) throw new Error("Identificador de contacto no válido.");
    ids.add(row.id);
    const contact = {id:row.id} as SupplierContact;
    for (const [key,label,max] of supplierContactFields) {
      if (typeof row[key] !== "string" || row[key].trim().length > max) throw new Error(`Revisa ${label} del contacto ${index+1}.`);
      contact[key] = row[key].trim();
    }
    if (!contact.name && !contact.email && !contact.mobile) throw new Error(`Completa el nombre, correo o celular del contacto ${index+1}, o elimínalo.`);
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error(`Correo no válido en el contacto ${index+1}.`);
    return contact;
  });
  return {...clean, rfc:clean.rfc.toUpperCase(), active:value.active, contacts, contact_name:contacts[0]?.name ?? "", email:contacts[0]?.email ?? "", mobile:contacts[0]?.mobile ?? ""};
}
