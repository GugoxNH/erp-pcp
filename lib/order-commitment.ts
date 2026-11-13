import type { Row, Material } from "./extract-order";
import { formatOrderDate, normalizeOrderDate } from "./order-dates.ts";

export type CommitmentEvidence = { raw: string; date: string; page: number; y: number; label: string };
const datePattern = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})|\d{1,2}[-/\s]+[a-záéíóú]+[-/\s]+(?:\d{4}|\d{2}))\b/gi;
const cell = (row: Row, from: number, to: number) => row.words.filter(w => w.x >= from && w.x < to).map(w => w.text).join(" ");

// Only inspected delivery fields/columns are eligible. Never search arbitrary dates.
const tables: Record<string, { header: RegExp; from: number; to: number }> = {
  SuKarne: { header: /^POS No\./, from: .90, to: 1 },
  "Taylor farms v2": { header: /^Línea ID de artículo/, from: .46, to: .56 },
  JhonsonMatthey: { header: /Item No.*Delivery/i, from: .71, to: .81 },
  MartinSproket: { header: /de línea.*Entrega/i, from: .52, to: .64 },
  Cargill: { header: /culo Material.*Entrega/i, from: .60, to: .69 },
  Ceypabasa: { header: /Descripción Entrega Cantidad/i, from: .39, to: .47 },
  Daltile: { header: /LIN ARTICULO.*ENVIAR/i, from: .34, to: .47 },
  Empacadora: { header: /Numero de No Parte.*Fecha/i, from: .87, to: .98 },
  Capistrano: { header: /Articulo Proveedor UM Entrega/i, from: .87, to: .98 },
  Dgari: { header: /Pos\..*Fecha entrega/i, from: .245, to: .39 },
  MInsa: { header: /PDA.*FECHA ENT/i, from: .62, to: .76 },
  Kerry: { header: /Item Material.*Delivery Date/i, from: .90, to: 1 },
  PPG: { header: /Línea Artículo Fecha de Entrega/i, from: .35, to: .49 },
  "Taylor farms": { header: /Description Delivery Quantity/i, from: .30, to: .39 },
};
const labels: Record<string, RegExp> = {
  Grupak: /\bFecha de Entrega\s*:\s*/i,
  Bachoco: /\bFecha de entrega\s*:?\s*/i, Campi: /\bFecha de entrega\s*:?\s*/i,
  Agrogen: /\bFecha de entrega\s*:?\s*/i,
  "Grupo Abrego": /\bFECHA DE ENTREGA\s*:?\s*/i, Nutribaq: /\bFECHA DE ENTREGA\s*:?\s*/i,
  PolloQro: /^FECHA DE ENTREGA\s*:?\s*/i,
  Pilgrims: /\bF[ce]\.\s*Entrega\s*:?\s*/i,
  Audace: /\bFech\.\s*Entrega[.:]?\s*/i,
  Hexpol: /\bDelivery Date\s*:?\s*/i, MEI: /\bDelivery Date\s*:?\s*/i,
  "Euro Nutec": /\bNecesario Para\s*:?\s*/i, NutecGaleras: /\bNecesario Para\s*:?\s*/i,
};

export function extractCommitment(company: string, rows: Row[], orderDate: string) {
  const evidence: CommitmentEvidence[] = [];
  const add = (text: string, row: Row, label: string) => {
    for (const match of text.matchAll(datePattern)) evidence.push({raw: match[0], date: normalizeOrderDate(match[0], company), page: row.page, y: row.y, label});
  };
  let active = false, page = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.page !== page) { active = false; page = row.page; }
    const label = labels[company]?.exec(row.text);
    if (label) {
      // A label followed by another field is not an invitation to scan its dates.
      const tail = row.text.slice(label.index + label[0].length).split(/Barrio:|ENTREGAR EN:|Subtotal|Tipo de Moneda/i)[0];
      add(tail, row, label[0].trim());
    }
    if (["Agro Alimentos Puebla", "Ferroservicios"].includes(company) && /^Fecha de Entrega:?$/i.test(row.text)) {
      for (const next of rows.slice(i+1,i+4)) if (next.page === row.page && row.y-next.y < 45) add(cell(next,.68,.94), next, "Fecha de Entrega");
    }
    if (company === "Calquimica" && /^FECHA DE ENTREGA CÓDIGO DE PROVEEDOR/i.test(row.text)) {
      const previous = rows[i-1];
      if (previous?.page === row.page && Math.abs(previous.y-row.y)<20) add(cell(previous,.23,.35), previous,"FECHA DE ENTREGA");
    }
    if (company === "Ingredion" && /FECHA ORDEN DE COMPRA FECHA DE ENTREGA/i.test(row.text)) {
      for (const next of rows.slice(i+1,i+4)) if(next.page===row.page && row.y-next.y<45) add(cell(next,.20,.32),next,"FECHA DE ENTREGA");
    }
    if(company==="Taylor farms v2" && /Fecha ordenada.*Promised Date/.test(row.text)) {
      const next=rows[i+1];if(next?.page===row.page) add(cell(next,.72,1),next,"Promised Date");
    }
    const table = tables[company];
    if (table?.header.test(row.text)) { active = true; continue; }
    if (/^(?:SUB\s*TOTAL|TOTAL|Net Value|Notas:|Notes:|Calendario|Avise|REQUISITOS|TÉRMINOS|TERMINOS|CONDICIONES GENERALES)/i.test(row.text)) active=false;
    if (active && table) add(cell(row,table.from,table.to),row,"Entrega por partida");
  }
  const unique = [...new Set(evidence.map(e => e.date).filter(Boolean))];
  const warnings: string[] = [];
  let date = "";
  if (evidence.some(e => !e.date)) warnings.push(`Fecha compromiso: hay fechas ambiguas o no válidas (${[...new Set(evidence.filter(e=>!e.date).map(e=>e.raw))].join(", ")}). Confirma en el PDF.`);
  else if (unique.length > 1) { /* Multiple dates are assigned to their source items below. */ }
  else if (unique.length === 1) {
    const issued = normalizeOrderDate(orderDate,company);
    if (issued && unique[0] < issued) warnings.push(`Fecha compromiso: el PDF indica ${formatOrderDate(unique[0])}, anterior a la fecha de la OC. Se conserva la fecha encontrada.`);
    date = unique[0];
  } else warnings.push("Fecha compromiso: no se encontró una fecha de entrega explícita y verificable. Captúrala manualmente; los plazos en días o semanas no se convierten automáticamente.");
  return { date, evidence, warnings };
}

export function assignCommitments(company: string, materials: Material[], evidence: CommitmentEvidence[]) {
  const valid = evidence.filter(e => e.date);
  const unique = [...new Set(valid.map(e => e.date))];
  const warnings: string[] = [];
  const items = materials.filter(m => !m.detail);
  for (const item of materials) item.commitmentDate = "";
  if (unique.length === 1 && valid.length === evidence.length) {
    for (const item of items) item.commitmentDate = unique[0];
    return warnings;
  }
  // Associate by source coordinates, not array index: detail rows and repeated
  // headers must not shift dates onto the next material.
  const after = (a: {page:number;y:number}, b: {page:number;y:number}) => a.page>b.page || (a.page===b.page && a.y<=b.y+2.5);
  const assigned = new Map<Material,CommitmentEvidence[]>();
  for (const entry of evidence) {
    let target: Material | undefined;
    if (company === "Pilgrims") {
      // Delivery blocks precede the items they cover, including across pages.
      for (const item of items) {
        if(item.sourceY===undefined || !after({page:item.page,y:item.sourceY},entry)) continue;
        const next = evidence.find(e=>e!==entry && after(e,entry) && after({page:item.page,y:item.sourceY!},e));
        if(!next) assigned.set(item,[...(assigned.get(item)??[]),entry]);
      }
      continue;
    }
    if (tables[company] || ["Audace","Euro Nutec","NutecGaleras"].includes(company)) {
      const candidates=items.filter(m=>m.sourceY!==undefined && m.page===entry.page && m.sourceY>=entry.y-2.5);
      target=candidates.sort((a,b)=>a.sourceY!-b.sourceY!)[0];
      // Only the PPG and labelled schedules place dates below the item row.
      if(target && !["PPG","Audace","Euro Nutec","NutecGaleras","Taylor farms v2"].includes(company) && Math.abs(target.sourceY!-entry.y)>2.5) target=undefined;
    }
    if(target) assigned.set(target,[...(assigned.get(target)??[]),entry]);
  }
  for(const [item,entries] of assigned) {
    const dates=[...new Set(entries.map(e=>e.date))];
    if(dates.length===1 && dates[0]) item.commitmentDate=dates[0];
  }
  if(items.some(m=>!m.commitmentDate) && evidence.length) warnings.push("Lectura de entrega: no se pudo asociar una fecha única a todas las partidas. Revisa las partidas sin fecha contra el PDF.");
  return warnings;
}
