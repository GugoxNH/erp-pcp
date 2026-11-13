export const businesses = [
  { id: "pcp", name: "PCP", logo: "/brands/pcp.png" },
  { id: "taasa", name: "Taasa", logo: "/brands/taasa.png" },
  { id: "jose", name: "José Orozco", logo: "/brands/jose.png" },
] as const;

export type Business = typeof businesses[number];
export type BusinessDetails = {
  legalName: string;
  personType: string;
  rfc: string;
  email: string;
  phone: string;
  contact: string;
  street: string;
  exterior: string;
  interior: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  clients: string[];
};

export function emptyBusinessDetails(): BusinessDetails {
  return { legalName: "", personType: "", rfc: "", email: "", phone: "", contact: "", street: "", exterior: "", interior: "", neighborhood: "", city: "", state: "", postalCode: "", country: "México", notes: "", clients: [] };
}

export function parseBusinessDetails(raw: string | null): BusinessDetails {
  const defaults = emptyBusinessDetails();
  if (!raw) return defaults;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid business details");
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof BusinessDetails)[]) {
    if (key === "clients") {
      if (Array.isArray(source.clients)) defaults.clients = [...new Set(source.clients.filter((item): item is string => typeof item === "string"))];
    } else if (typeof source[key] === "string") defaults[key] = source[key];
  }
  return defaults;
}

export const businessStorageKey = (id: Business["id"]) => `warehouse.business.${id}.v1`;
