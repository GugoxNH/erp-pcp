import type { Material, Order, Row } from "./extract-order";

export const pilgrimsCompanies = ["Pilgrims - Tepeji", "Pilgrims - San Luis Potosí", "Pilgrims - Cuez", "Pilgrims - Laguna 2", "Pilgrims - Popular", "Pilgrims - Porvenir", "Pilgrims - 5 de Febrero"] as const;

export function isPilgrims(company: string) {
  return company === "Pilgrims" || pilgrimsCompanies.some(name => name === company);
}

export const pilgrimsSignature = /PILGRIM[\s'’]*S\s+PRIDE|PPR910701LEA/i;

export function extractPilgrims(company: string, rows: Row[], result: Order) {
  if (company !== "Pilgrims") return;
  const text = rows.map(r => r.text).join("\n");
  const get = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  const money = "([\\d,]+\\.\\d{2,6})(?!\\d)";
  result.id = get(/Orden de Compra\s+(\d+)\s*-?\s*Fecha:/i);
  result.date = get(/Orden de Compra\s+\d+\s*-?\s*Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i);
  result.currency = get(/Moneda:\s*(M\s*XN|M\s*XP|USD|EUR)\b/i).replace(/\s/g, "");
  result.subtotal = get(new RegExp("Subtotal con descuento\\s*[|]?\\s*" + money, "i")) || get(new RegExp("Subtotal\\s*\\(\\+\\)\\s*[|]?\\s*" + money, "i"));
  result.tax = get(new RegExp("Iva\\s*\\(\\+\\)\\s*[|]?\\s*" + money, "i"));
  result.total = get(new RegExp("TOTAL\\s*\\(=\\)\\s*[|]?\\s*" + money, "i"));
  result.materials = [];

  let columns: { description: number; quantity: number; unit: number } | undefined;
  let active = false;
  let item: Material | undefined;
  let descriptionEnded = false;
  for (const row of rows) {
    if (/CONDICIONES GENERALES/i.test(row.text)) break;
    if (/^(?:Empresa:|Subtotal|Descuento\s*\(|Iva\s*\(|[| ]*TOTAL\s*\()/i.test(row.text)) {
      active = false;
      item = undefined;
    }
    // Anchor to table headings, since the scanned landscape format has different margins.
    const product = row.words.find(w => /^Producto$/i.test(w.text));
    const quantity = row.words.find(w => /^Cant\.$/i.test(w.text));
    const unit = row.words.find(w => /^Un\.$/i.test(w.text));
    if (product && quantity && unit) {
      columns = {description: product.x - .003, quantity: quantity.x - .003, unit: unit.x - .003};
      active = true;
      continue;
    }
    if (!active || !columns || /https?:\/\/|Mercado Eletr[oô]nico/i.test(row.text)) continue;
    const cell = (a: number, b: number) => row.words.filter(w => w.x >= a && w.x < b).map(w => w.text).join(" ").trim();
    const description = cell(columns.description, columns.quantity);
    const code = description.match(/^(\d{12,})\s*-\s*(.*)/);
    // Descriptions can start above the vertically centered quantity and continue on the next page.
    if (code) {
      item = {position:"",code:code[1],description:code[2],quantity:"",unit:"",price:"",amount:"",page:row.page, sourceY: row.y};
      result.materials.push(item);
      descriptionEnded = false;
    } else if (item && /^(?:Solicitud|Solicitante):/i.test(description)) descriptionEnded = true;
    else if (item && !descriptionEnded && description) item.description += " " + description;
    if (!item) continue;
    const position = cell(0, columns.description);
    const count = cell(columns.quantity, columns.unit);
    const values = cell(columns.unit, 1).match(new RegExp("^([A-Z]+)\\s+" + money + "\\s+" + money + "\\s+" + money + "\\s+" + money + "(?:\\s|$)"));
    if (/^\d+$/.test(position) && /^\d+(?:\.\d+)?$/.test(count) && values) {
      item.position = position;
      item.quantity = count;
      item.unit = values[1];
      item.price = values[3]; // Unit price after discount, before tax.
      item.amount = values[5];
    }
  }
  if (result.materials.some(m => !m.position || !m.quantity || !m.price || !m.amount)) {
    result.warnings.push("Pilgrims: hay partidas con datos incompletos. Revisa las columnas en el PDF.");
  }
}
