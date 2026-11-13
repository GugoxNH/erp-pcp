export type ProductClientCode = { client_id: string; code: string };
export type ProductClientOption = { id: string; name: string; active: boolean };
export type Product = { id: string; sku: string; name: string; unit: string; category: string; brand: string; model: string; notes: string; active: boolean; updated_at: string; client_codes: ProductClientCode[]; supplier_ids: string[]; supplier_codes: Record<string, string> };
export const units = ["Pieza", "Juego", "Kit", "Metro", "Kilogramo", "Litro", "Caja", "Paquete"];
export function blankProduct(): Product { return { id: "", sku: "", name: "", unit: "Pieza", category: "", brand: "", model: "", notes: "", active: true, updated_at: "", client_codes: [], supplier_ids: [], supplier_codes: {} }; }
export function validateProduct(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Producto no válido.");
  const value = input as Record<string, unknown>;
  const fields = { sku: 80, name: 300, unit: 30, category: 100, brand: 100, model: 100, notes: 2000 };
  const clean: Record<string, string> = {};
  for (const [key, max] of Object.entries(fields)) {
    if (typeof value[key] !== "string" || value[key].trim().length > max) throw new Error(`Revisa el campo ${key}.`);
    clean[key] = value[key].trim();
  }
  if (!clean.sku || !clean.name || !units.includes(clean.unit)) throw new Error("Código, descripción y unidad son obligatorios.");
  if (typeof value.active !== "boolean") throw new Error("Estado no válido.");
  if (!Array.isArray(value.client_codes)) throw new Error("Revisa los códigos de cliente.");
  const seen = new Set<string>();
  const client_codes = value.client_codes.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Código de cliente no válido.");
    const row = entry as Record<string,unknown>;
    if (typeof row.client_id !== "string" || !row.client_id.trim() || row.client_id.length > 200 || typeof row.code !== "string" || !row.code.trim() || row.code.trim().length > 80) throw new Error("Selecciona un cliente y captura su código en cada fila.");
    const key = JSON.stringify([row.client_id,row.code.trim().toUpperCase()]);
    if (seen.has(key)) throw new Error("Hay códigos repetidos para el mismo cliente.");
    seen.add(key);
    return { client_id: row.client_id, code: row.code.trim() };
  });
  if (!Array.isArray(value.supplier_ids) || value.supplier_ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) || new Set(value.supplier_ids).size !== value.supplier_ids.length) throw new Error("Selecciona proveedores válidos sin repetirlos.");
  const codes = value.supplier_codes ?? {};
  if (typeof codes !== "object" || Array.isArray(codes)) throw new Error("Revisa los códigos de proveedor.");
  const supplier_codes: Record<string, string> = {};
  for (const id of value.supplier_ids as string[]) {
    const code = (codes as Record<string, unknown>)[id] ?? "";
    if (typeof code !== "string" || code.trim().length > 80) throw new Error("El código del proveedor debe tener como máximo 80 caracteres.");
    supplier_codes[id] = code.trim();
  }
  return { ...clean, supplier_codes, sku: clean.sku.toUpperCase(), active: value.active, client_codes, supplier_ids: value.supplier_ids as string[] };
}
