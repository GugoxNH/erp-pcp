import { companies } from "./extract-order";
import { readContactList, type ClientContact } from "./client-contacts";

export type Client = {
  id: string;
  name: string;
  legalName: string;
  personType: "" | "fisica" | "moral";
  rfc: string;
  contact: string;
  email: string;
  phone: string;
  contacts: ClientContact[];
  street: string;
  exterior: string;
  interior: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  active: boolean;
  legacyName: string;
  orderTemplate: string;
  updatedAt?: string;
};

export const CLIENTS_KEY = "warehouse.clients.v1";
export const CLIENTS_EVENT = "warehouse-clients-changed";
export const normalizeClientName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

export function blankClient(): Client {
  return { id: "", name: "", legalName: "", personType: "", rfc: "", contact: "", email: "", phone: "", contacts: [], street: "", exterior: "", interior: "", neighborhood: "", city: "", state: "", postalCode: "", country: "México", notes: "", active: true, legacyName: "", orderTemplate: "" };
}

export function readClients(raw: string | null = localStorage.getItem(CLIENTS_KEY)): Client[] {
  if (raw === null) return companies.map(name => ({ ...blankClient(), id: `catalog:${name}`, name, legacyName: name, orderTemplate: name }));
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("El catálogo guardado no es válido.");
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim()) throw new Error("El catálogo guardado no es válido.");
    ids.add(item.id);
    const result = blankClient();
    for (const key of Object.keys(result) as (keyof Client)[]) {
      if (key === "active") result.active = typeof item.active === "boolean" ? item.active : true;
      else if (key === "contacts") result.contacts = readContactList(item.contacts, item);
      else if (key === "personType") result.personType = ["fisica", "moral"].includes(item.personType) ? item.personType : "";
      else if (typeof item[key] === "string") result[key] = item[key];
    }
    return result;
  });
}

export function isClientAssigned(client: Client, assignments: string[]) {
  return assignments.includes(client.id) || (!!client.legacyName && assignments.includes(client.legacyName));
}
