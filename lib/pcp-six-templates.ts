import type { Row, Order, Material } from "./extract-order";

export const pcpSixSignatures: Record<string, RegExp> = {
  "Agro Alimentos Puebla": /AGROALIMENTOS DE PUEBLA|APU110404KX4/i,
  NutecGaleras: /NUEVA TECNOLOGIA EN ALIMENTACION|NTA931214IJ6/i,
  MInsa: /MINSA COMERCIAL/i,
  Kerry: /KERRY INGREDIENTS|KERRY ING\./i,
  Hexpol: /Hexpol Compounding/i,
  Capistrano: /ARRENDAMIENTOS DE QUERETARO|AQU990521LQ7/i,
};

export function extractPcpSix(company: string, rows: Row[], result: Order) {
  if (!pcpSixSignatures[company]) return;
  const text = rows.map(r => r.text).join("\n");
  const get = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  const money = "([\\d,]+\\.\\d{2,4})";
  const cell = (r: Row, a: number, b: number) => r.words.filter(w => w.x >= a && w.x < b).map(w => w.text).join(" ").trim();
  result.materials = [];
  result.subtotal = result.tax = result.total = "";
  if (company === "Agro Alimentos Puebla") {
    result.id = get(/^OC\s+([^\n]+)/m);
    result.subtotal = get(new RegExp("Sub Total:\\s*" + money, "i"));
    result.tax = get(new RegExp("IVA:\\s*(?:[\\d.]+\\s*%\\s*)?" + money, "i"));
    result.total = get(new RegExp("TOTAL\\s*\\$:\\s*" + money, "i"));
  } else if (company === "NutecGaleras") {
    result.id = get(/^No\.\s+(\S+)/m);
    result.date = get(/Fecha\s+(\d{2}-[A-Z]+-\d{4})/i);
    result.subtotal = get(new RegExp("Subtotal:\\s*" + money, "i"));
    result.tax = get(new RegExp("IVA:\\s*" + money, "i"));
    result.total = get(new RegExp("^Total:\\s*" + money, "im"));
  } else if (company === "MInsa") {
    result.id = get(/\b(PC-\d+)\b/);
    const dates = rows.find(r => /^\d{2} \d{2} \d{4}/.test(r.text));
    result.date = dates?.text.match(/^(\d{2}) (\d{2}) (\d{4})/)?.slice(1).join("/") || "";
    result.currency = get(/TOTAL\s*\((MXP|MXN|USD|EUR)\)/i);
    result.subtotal = get(new RegExp("SUBTOTAL\\s+" + money));
    result.tax = get(new RegExp("^IVA\\s+" + money, "m"));
    result.total = get(new RegExp("TOTAL\\s*\\([A-Z]+\\)\\s+" + money));
  } else if (company === "Kerry") {
    result.id = get(/Purchase Order\s+(\d+)/i);
    result.date = get(/Purchase Order Date:\s*([\d/]+)/i);
    result.subtotal = get(new RegExp("Net Total\\s+" + money));
    result.tax = get(new RegExp("Total VAT\\s+" + money));
    result.total = get(new RegExp("^Total\\s+" + money, "m"));
  } else if (company === "Hexpol") {
    result.id = get(/Purchase document\s+(\d+)/i);
    result.date = get(/P\.O\. CREATE DATE:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/);
    result.subtotal = get(new RegExp("Total net value excl\\. tax\\s+[A-Z]+\\s+" + money));
    result.warnings.push("La fecha de Hexpol está expresada en mes/día/año. El documento solo presenta el subtotal sin impuestos.");
  } else {
    // The document-type code (DB, O2, etc.) is independent of the order number.
    const label = rows.find(r => /N[uú]mero de Orden/i.test(r.text));
    const labelEnd = label?.words.find(w => /^Orden$/i.test(w.text));
    const right = labelEnd ? labelEnd.x + labelEnd.width : undefined;
    result.id = label && right !== undefined ? rows
      .filter(r => r.page === label.page && Math.abs(r.y-label.y) < 8)
      .flatMap(r => r.words)
      .filter(w => w.x >= right && w.x < right + .12 && /^\d+$/.test(w.text))
      .sort((a,b) => a.x-b.x)[0]?.text || "" : "";
    result.date = get(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    result.subtotal = get(new RegExp("Subtotal\\s*\\$\\s*" + money, "i"));
    result.tax = get(new RegExp("Iva\\s*\\$\\s*" + money, "i"));
    result.total = get(new RegExp("^Total\\s*\\$\\s*" + money, "im"));
  }
  let active = false, page = 0, lastY = 0;
  let last: Material | undefined;
  for (const row of rows) {
    if (page !== row.page) { active = false; last = undefined; page = row.page; }
    const agroHeader = company === "Agro Alimentos Puebla" && /^#\s+\S+\s+Descripci[oó]n\s+Almac[eé]n\s+UM\s+\S+\s+PU\s+Total$/i.test(row.text);
    if (agroHeader || /# Artículo Descripción|Línea Artículo Descripción|PDA CANTIDAD|Item Material Description|Linea Descripcion Ordenado/.test(row.text)) { active = true; continue; }
    if (/Sub Total:|Subtotal|SUBTOTAL|Net Total|Total net value|^Notas:/.test(row.text)) { active = false; last = undefined; }
    if (!active) continue;
    if (company === "Agro Alimentos Puebla") {
      // Account/cost-center rows are not product text; keep the item for its comments.
      if (/^\d{4}-\d{3}-\d{3}/.test(row.text)) continue;
      if (/^Comentarios:/i.test(row.text)) {
        if (last) last.description += " " + row.text.replace(/^Comentarios:\s*/i, "");
        continue;
      }
    }
    if (/^Embalaje:|^Comentarios:|^\d{4}-\d{3}-\d{3}/.test(row.text)) { last = undefined; continue; }
    const base: Material = { position:"", code:"", description:"", quantity:"", unit:"", price:"", amount:"", page:row.page, sourceY: row.y };
    let item: Material | undefined, m: RegExpMatchArray | null;
    if (company === "Agro Alimentos Puebla") {
      m = row.text.match(new RegExp("^(\\d+)\\s+(\\S+)\\s+(.+?)\\s+\\S+\\s+(\\S+)\\s+([\\d.]+)\\s+\\$\\s*" + money + "\\s+\\$\\s*" + money + "$"));
      if (m) item = {...base,position:m[1],code:m[2],description:m[3],unit:m[4],quantity:m[5],price:m[6],amount:m[7]};
    } else if (company === "NutecGaleras") {
      m = row.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\S+)\\s+([\\d.]+)\\s+([\\d.,]+)\\s+" + money + "\\s+" + money + "$"));
      if (m) item = {...base,position:m[1],description:m[2],unit:m[3],quantity:m[4],price:m[5],amount:m[7]};
    } else if (company === "MInsa") {
      m = row.text.match(new RegExp("^([\\d.]+)\\s+([\\d.]+)\\s+(\\S+)\\s+(.+?)\\s+\\d{2}/\\d{2}/\\d{4}\\s+" + money + "\\s+" + money + "$"));
      if (m) item = {...base,position:m[1],quantity:m[2],unit:m[3],description:m[4],price:m[5],amount:m[6]};
      else if (last && lastY-row.y > 12) last = undefined; // Blank line ends the highlighted product heading.
    } else if (company === "Kerry") {
      m = row.text.match(new RegExp("^(\\d{5})\\s+(\\d+)\\s+(.+?)\\s+([\\d.]+)\\s+(\\S+)\\s+" + money + "\\s+\\d+\\s*\\S+\\s+" + money + "\\s+[\\d.]+%\\s+" + money + "\\s+\\d{2}\\.\\d{2}\\.\\d{4}$"));
      if (m) item = {...base,position:m[1],code:m[2],description:m[3],quantity:m[4],unit:m[5],price:m[6],amount:m[7]};
    } else if (company === "Hexpol") {
      m = row.text.match(/^(\d{5})\s+(.+)/);
      if (m) item = {...base,position:m[1],description:m[2]};
      else if (last) {
        const values = row.text.match(new RegExp("^([\\d.]+)\\s+(\\S+)\\s+" + money + "/\\S+\\s+\\d+\\s+" + money + "$"));
        if (values) [last.quantity,last.unit,last.price,last.amount] = values.slice(1);
        else if (!/^[_=]+$|^Freight\/|^Delivery Date:/.test(row.text)) last.description += " " + row.text;
        continue;
      }
    } else if (company === "Capistrano") {
      if (/^\d+\.\d+\s/.test(row.text) && /\$/.test(row.text)) {
        item = {...base,position:cell(row,0,.065),description:cell(row,.065,.37),code:cell(row,.37,.455),quantity:cell(row,.535,.61),unit:cell(row,.645,.68),price:cell(row,.68,.77).replace(/\$/g,""),amount:cell(row,.80,.88).replace(/\$/g,"")};
      } else if (last) {
        const description = cell(row,.065,.37);
        if (description) last.description += " " + description;
        // A fourth decimal can wrap onto its own row in the price columns.
        for (const [key,a,b] of [["price",.68,.77],["amount",.80,.88]] as const) {
          const tail = cell(row,a,b);
          if (/^\d$/.test(tail) && /\.\d{3}$/.test(last[key])) last[key] += tail;
        }
        continue;
      }
    }
    if (item) { result.materials.push(item); last = item; }
    else if (last) last.description += " " + row.text;
    lastY = row.y;
  }
}
