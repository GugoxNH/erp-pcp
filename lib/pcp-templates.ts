import type { Row, Order, Material } from "./extract-order";

export const pcpSignatures: Record<string, RegExp> = {
  Sherwin: /Sherwin-Williams/i,
  Ferroservicios: /FERROSERVICIOS|FER061024LJA/i,
  "Euro Nutec": /EURO-NUTEC PREMIX/i,
  "PPG AP Resinas": /PPG AP RESINAS SA DE CV|COM031204L28/i,
  "PPG Comex": /COMERCIAL MEXICANA DE PINTURAS SA DE CV|CMP8011309T6/i,
  Comex: /EMPRESA AGA SA DE CV|EAG761018LQ8/i,
  Dgari: /PRODUCTOS ALIMENTICIOS Y DIETETICOS RELAMPAGO|TZW141008RS4/i,
};

export function extractPcp(company: string, rows: Row[], result: Order) {
  if (!pcpSignatures[company]) return;
  const text = rows.map(r => r.text).join("\n");
  const capture = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  const money = "([\\d,]+\\.\\d{2,4})";
  result.materials = [];
  result.subtotal = result.tax = result.total = "";
  if (company === "Sherwin") {
    result.id = capture(/PO NUMBER\s+(\S+)/i);
    result.date = capture(/DATE\s+([\d/]+)/i);
    result.total = capture(new RegExp("^" + money + "\\s+(?:MXN|USD|EUR)$", "m"));
    result.warnings.push("La fecha de Sherwin está expresada en mes/día/año. No se desglosa IVA en este documento.");
  } else if (company === "Ferroservicios") {
    result.id = capture(/^OC\s+([^\n]+)/m);
    result.subtotal = capture(new RegExp("Sub Total:\\s*" + money, "i"));
    result.tax = capture(new RegExp("IVA:\\s*(?:\\d+(?:\\.\\d+)?\\s*%\\s*)?" + money, "i"));
    result.total = capture(new RegExp("TOTAL\\s*\\$:\\s*" + money, "i"));
  } else if (company === "Euro Nutec") {
    result.id = capture(/^No\.\s+(\S+)/m);
    result.date = capture(/Fecha\s+(\d{2}-[A-Z]+-\d{4})/i);
    result.subtotal = capture(new RegExp("Subtotal:\\s*" + money, "i"));
    result.tax = capture(new RegExp("IVA:\\s*" + money, "i"));
    result.total = capture(new RegExp("^Total:\\s*" + money, "im"));
  } else if ((company === "Comex" || company === "PPG AP Resinas" || company === "PPG Comex")) {
    const label = rows.find(r => /Número de pedido/i.test(r.text));
    result.id = label ? rows.filter(r => r.page === label.page && r.y > label.y && r.y - label.y < 25)
      .flatMap(r => r.words).find(w => w.x > .8 && /^\d+$/.test(w.text))?.text || "" : "";
    result.date = capture(/\b(\d{2}-[A-Z]{3}-\d{2})\b/);
    result.currency = capture(/^\s*(MXN|USD|EUR)\s*$/m);
    result.subtotal = capture(new RegExp("Subtotal\\s*\\$\\s*" + money, "i"));
    result.tax = capture(new RegExp("\\bIVA\\s*\\$\\s*" + money, "i"));
    result.total = capture(new RegExp("^Total\\s*\\$\\s*" + money, "im"));
  } else {
    result.id = capture(/Pedido\s+(\d+)/i);
    result.date = capture(/El Marqu[eé]s,\s*([\d.]+)/i);
    result.currency = capture(/Valor neto total sin IVA\s+(MXN|USD|EUR)/i);
    result.subtotal = capture(new RegExp("Valor neto total sin IVA\\s+(?:MXN|USD|EUR)\\s+" + money, "i"));
  }

  let active = false;
  let last: Material | undefined;
  let page = 0;
  if (company === "PPG Comex") {
    // Keep the last item across repeated headers/footers, but only read inside the table.
    for (const row of rows) {
      if (page !== row.page) { active = false; page = row.page; }
      if (/Item Description Quantity/.test(row.text)) { active = true; continue; }
      if (!active) continue;
      if (/Fecha de entrega \/ Delivery Date|^Aviso Importante/.test(row.text)) {
        active = false;
        if (/^Aviso/.test(row.text)) last = undefined;
        continue;
      }
      const m = row.text.match(new RegExp("^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\S+)\\s+\\$\\s*" + money + "\\s+\\$\\s*" + money + "$"));
      if (m) {
        last = {position:"",code:"",description:m[1],quantity:m[2],unit:m[3],price:m[4],amount:m[5],page:row.page, sourceY: row.y};
        result.materials.push(last);
      } else if (/^NOTA[S]?:|^Tiempo de entrega:|^Uso de CFDI:|^Requisitor:/i.test(row.text)) last = undefined;
      else if (last) last.description += " " + row.text;
    }
    if (result.currency === "MXN" && /Dolares Americanos/i.test(text)) result.warnings.push("El campo de moneda indica MXN, pero una nota menciona dólares americanos. Confirma la moneda antes de utilizar los importes.");
    return;
  }
  for (const row of rows) {
    if (page !== row.page) { active = false; last = undefined; page = row.page; }
    if (/Line Description|# Descripción UM|Línea Artículo Descripción|Item Description Quantity|Pos\. Artículo Fecha/.test(row.text)) { active = true; last = undefined; continue; }
    if (!active) continue;
    if (company === "PPG AP Resinas" && /^(?:Cotizaci[oó]n:|Autogesti[oó]n:|Realizo:|Solicito:|Autorizo:|Uso del CFDI:)/i.test(row.text)) { active = false; last = undefined; continue; }
    if (/^(?:[\d,]+\.\d{2}\s+(?:MXN|USD)|Sub Total|Subtotal|Valor neto|Comentarios:|Embalaje:|BOQUILLA PARA EQUIPO|SOLICITA|AUTORIZA|G03|Aviso Importante|Productos Alimenticios)/i.test(row.text)) { active = false; last = undefined; continue; }
    let m: RegExpMatchArray | null = null;
    let item: Material | undefined;
    const base = { position: "", code: "", description: "", quantity: "", unit: "", price: "", amount: "", page: row.page, sourceY: row.y };
    if (company === "Sherwin") {
      m = row.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\S+)\\s+" + money + "\\s+" + money + "$"));
      if (m) item = { ...base, position:m[1], description:m[2], quantity:m[3], unit:m[4], price:m[5], amount:m[6] };
    } else if (company === "Ferroservicios") {
      m = row.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s+\\$\\s*" + money + "\\s+\\$\\s*" + money + "$"));
      if (m) item = { ...base, position:m[1], description:m[2], unit:m[3], quantity:m[4], price:m[5], amount:m[6] };
    } else if (company === "Euro Nutec") {
      m = row.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s+([\\d.,]+)\\s+" + money + "\\s+" + money + "$"));
      if (m) item = { ...base, position:m[1], description:m[2], unit:m[3], quantity:m[4], price:m[5], amount:m[7] };
    } else if ((company === "Comex" || company === "PPG AP Resinas" || company === "PPG Comex")) {
      m = row.text.match(new RegExp("^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\S+)\\s+\\$\\s*" + money + "\\s+\\$\\s*" + money + "$"));
      if (m) item = { ...base, description:m[1], quantity:m[2], unit:m[3], price:m[4], amount:m[5] };
    } else {
      // The article column may be empty or contain a code before the delivery date.
      m = row.text.match(new RegExp("^(\\d{4})\\s+(?:(\\S+)\\s+)?\\d{2}\\.\\d{2}\\.\\d{4}\\s+(\\d+(?:[.,]\\d+)?)\\s+(\\S+)\\s+" + money + "\\s+(?:MXN|MXP|USD|EUR)\\s*/\\s*\\d+\\s+\\S+\\s+" + money + "$"));
      if (m) item = { ...base, position:m[1], code:m[2] || "", quantity:m[3], unit:m[4], price:m[5], amount:m[6] };
    }
    if (item) { result.materials.push(item); last = item; }
    else if (last && company !== "Ferroservicios") last.description = (last.description + " " + row.text).trim();
  }
}


