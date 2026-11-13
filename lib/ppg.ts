import type { Row, Order, Material } from "./extract-order";

export const ppgSignature = /PPG INDUSTRIES DE MEXICO|PPG870901SE0/i;

export function extractPpg(company: string, rows: Row[], result: Order) {
  if (company !== "PPG") return;
  const text = rows.map(r => r.text).join("\n");
  const get = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  result.id = get(/^Orden\s+(\d+)/im);
  result.date = get(/Fecha de orden\s+(\d{2}-[A-Z]{3}-\d{4})/i);
  result.currency = get(/Moneda\s+(MXN|MXP|USD|EUR)/i);
  result.total = get(/^Total:\s*([\d,]+\.\d{2})\s*\([A-Z]+\)/im);
  result.subtotal = "";
  result.tax = "";
  result.materials = [];
  result.warnings.push("PPG no desglosa subtotal ni IVA en estas órdenes. Se conserva el Total impreso; la marca N de la columna de impuesto no se interpreta como IVA cero.");
  let active = false;
  let last: Material | undefined;
  for (const row of rows) {
    if (/^PO#|^ESTA ORDEN|^CONTRATO DE SUMINISTRO/.test(row.text)) { active = false; last = undefined; }
    if (/Línea Artículo Fecha de Entrega/.test(row.text)) { active = true; continue; }
    if (!active) continue;
    if (/^Total:/.test(row.text)) { active = false; last = undefined; continue; }
    const m = row.text.match(/^(\d+)\s+(?:(\S+)\s+)?Needed:\s+([\d.,]+)\s+(\S+)\s+([\d,]+(?:\.\d+)?)\s+[NY]\s+([\d,]+\.\d{2})$/);
    if (m) {
      last = {position:m[1],code:m[2] || "",description:"",quantity:m[3],unit:m[4],price:m[5],amount:m[6],page:row.page, sourceY: row.y};
      result.materials.push(last);
      continue;
    }
    if (!last) continue;
    if (/^["“]?Calidad para|^PARA QUE SU FACTURA|^Ship To:|^Deliver To:|@ppg\.com/i.test(row.text)) { last = undefined; continue; }
    // Delivery dates and optional article-account codes precede the description.
    if (/\d{2}-[A-Z]{3}-\d{4}$|^\d{2}:\d{2}:\d{2}$/.test(row.text)) continue;
    last.description = (last.description + " " + row.text).trim();
  }
}
