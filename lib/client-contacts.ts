export type ClientContact = { id: string; name: string; area: string; email: string; phone: string; mobile: string; observations: string };
type LegacyContact = { contact?: unknown; email?: unknown; phone?: unknown };

export function readContactList(value: unknown, legacy: LegacyContact): ClientContact[] {
  if (value === undefined || value === null) {
    const name = typeof legacy.contact === "string" ? legacy.contact : "";
    const email = typeof legacy.email === "string" ? legacy.email : "";
    const phone = typeof legacy.phone === "string" ? legacy.phone : "";
    return name || email || phone ? [{ id: "legacy", name, area: "", email, phone, mobile: "", observations: "" }] : [];
  }
  if (!Array.isArray(value)) throw new Error("La lista de contactos no es válida.");
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Contacto ${index + 1} no válido.`);
    const contact = {} as ClientContact;
    for (const key of ["id", "name", "area", "email", "phone"] as const) {
      if (typeof entry[key] !== "string" || entry[key].length > (key === "id" ? 80 : 500)) throw new Error(`Revisa el campo ${key} del contacto ${index + 1}.`);
      contact[key] = entry[key];
    }
    for (const key of ["mobile", "observations"] as const) {
      const value = entry[key] === undefined ? "" : entry[key];
      if (typeof value !== "string" || value.length > (key === "observations" ? 2000 : 500)) throw new Error(`Revisa el campo ${key} del contacto ${index + 1}.`);
      contact[key] = value;
    }
    if (!contact.id.trim() || ids.has(contact.id)) throw new Error("Hay contactos sin identificador o repetidos.");
    ids.add(contact.id);
    return contact;
  });
}

export function validateContacts(value: unknown, legacy: LegacyContact): ClientContact[] {
  return readContactList(value, legacy).map((contact, index) => {
    const clean = { ...contact, name: contact.name.trim(), area: contact.area.trim(), email: contact.email.trim(), phone: contact.phone.trim(), mobile: contact.mobile.trim(), observations: contact.observations.trim() };
    if (!clean.name && !clean.email && !clean.phone && !clean.mobile) throw new Error(`Completa el nombre, correo o teléfono del contacto ${index + 1}, o elimínalo.`);
    if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error(`Correo electrónico no válido en el contacto ${index + 1}.`);
    return clean;
  });
}
