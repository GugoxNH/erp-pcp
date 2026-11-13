import type { Row, Order, Material } from "./extract-order";

export const dsaAudaceSignatures: Record<string, RegExp> = {
  DSA: /DSA M[eé]xico|DISEÑO, SERVICIO Y APLICACION PARA LA INDUSTRIA/i,
  Audace: /AGROINDUSTRIAS DE C[ÓO]RDOBA|ACO031110RIA/i,
};

export function extractDsaAudace(company: string, rows: Row[], result: Order) {
  if (!dsaAudaceSignatures[company]) return;
  const text = rows.map(r => r.text).join("\n");
  const get = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  const money = "([\\d,]+\\.\\d{2})";
  result.materials = [];
  result.subtotal = get(new RegExp("Subtotal\\s*\\$?\\s*" + money, "i"));
  if (company === "DSA") {
    result.id = get(/Orden de compra\s*#\s*(\S+)/i);
    result.date = get(/Fecha del pedido:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
    result.currency = /moneda nacional/i.test(text) ? "MXN" : get(/\b(MXN|USD|EUR)\b/);
    result.tax = get(new RegExp("^IVA\\s+[\\d.]+%\\s*\\$?\\s*" + money, "im"));
    result.total = get(new RegExp("^Total\\s*\\$?\\s*" + money, "im"));
  } else {
    result.id = get(/N[uú]mero\s+(\d+)/i);
    result.currency = get(/TOTAL\s*\((MXN|MXP|USD|EUR)\)/i);
    result.tax = get(new RegExp("Impuesto\\s*\\([\\d.]+%\\)\\s*" + money, "i"));
    result.total = get(new RegExp("TOTAL\\s*\\([A-Z]+\\):\\s*" + money, "i"));
  }
  let active = false, page = 0;
  let last: Material | undefined;
  for (const row of rows) {
    if (page !== row.page) { active = false; last = undefined; page = row.page; }
    if (/Descripción Impuestos Fecha|Pos\. Código Descripcion/.test(row.text)) { active = true; continue; }
    if (/^Subtotal|^Precios cotizados|^Tiempo de entrega|^Observaciones/i.test(row.text)) { active = false; last = undefined; }
    if (!active) continue;
    const base: Material = {position:"",code:"",description:"",quantity:"",unit:"",price:"",amount:"",page:row.page, sourceY: row.y};
    if (company === "DSA") {
      const m = row.text.match(new RegExp("^(.+?)\\s+IVA\\([\\d.]+%\\)\\s+\\d{2}/\\d{2}/\\d{4}\\s+([\\d.]+)\\s+" + money + "\\s*\\$\\s*" + money + "$"));
      if (m) { last = {...base,description:m[1],quantity:m[2],price:m[3],amount:m[4]}; result.materials.push(last); }
      else if (last) {
        const description = row.words.filter(w => w.x < .39).map(w => w.text).join(" ");
        if (description) last.description += " " + description;
        const unit = row.words.filter(w => w.x >= .67 && w.x < .78).map(w => w.text).join(" ");
        if (unit) last.unit = unit;
      }
    } else {
      const m = row.text.match(/^(\d+)\s+(.+?)\s+([\d.]+)\s+(\S+)$/);
      if (m) { last = {...base,position:m[1],description:m[2],quantity:m[3],unit:m[4]}; result.materials.push(last); }
      else if (last) {
        const amounts = row.text.match(new RegExp("^(.+?)\\s+\\S+\\s+" + money + "\\s+" + money + "$"));
        if (amounts) { last.price = amounts[2]; last.amount = amounts[3]; last = undefined; }
        else if (!/^Fech\. Entrega\./.test(row.text)) last.description += " " + row.text;
      }
    }
  }
}

