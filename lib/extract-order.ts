import { extractNewClients, newClientSignatures } from "./new-client-templates.ts";
import { extractPilgrims, pilgrimsSignature, pilgrimsCompanies, isPilgrims } from "./pilgrims.ts";
import { extractNutribaq, nutribaqSignature } from "./nutribaq.ts";
import { extractPpg, ppgSignature } from "./ppg.ts";
import { extractDsaAudace, dsaAudaceSignatures } from "./dsa-audace.ts";
import { extractPcpSix, pcpSixSignatures } from "./pcp-six-templates.ts";
import { extractPcp, pcpSignatures } from "./pcp-templates.ts";
import { extractMore, moreSignatures } from "./more-templates.ts";
import { resolveSubtotal } from "./subtotal.ts";
import { extractAdditional } from "./additional-templates.ts";
import { extractCommitment, assignCommitments, type CommitmentEvidence } from "./order-commitment.ts";
export const companies = ["JhonsonMatthey", "inovatelia", "Bachoco", "Campi", "Ceat", "OMG", "MEI", "MartinSproket", "Cargill", "Cargil Irapuato", "Calquimica", "Agrogen", "Daltile", "Ceypabasa", "Grupo Abrego", "PolloQro", "Ingredion", "Empacadora", "Taylor farms", "Sherwin", "Ferroservicios", "Euro Nutec", "Comex", "Dgari", "Agro Alimentos Puebla", "NutecGaleras", "NutecJCF", "MInsa", "Kerry", "Hexpol", "Capistrano", "DSA", "Audace", "PPG", "PPG AP Resinas", "PPG Comex", "Nutribaq", "Grupak", "SuKarne", "Pilgrims Tepeji Consigna", ...pilgrimsCompanies] as const;
export type Word = { text: string; x: number; y: number; width: number };
export type Row = { text: string; words: Word[]; y: number; page: number };
export type Material = { kind?: "parts" | "service"; position: string; code: string; description: string; quantity: string; unit: string; price: string; amount: string; page: number; sourceY?: number; commitmentDate?: string; detail?: boolean };
export type Order = { id: string; date: string; commitmentDate?: string; commitmentEvidence?: CommitmentEvidence[]; currency: string; materials: Material[]; subtotal: string; subtotalSource?: "calculated"; subtotalOriginal?: string; tax: string; total: string; warnings: string[] };

// Coordinates are fractions of page width; rows preserve visual reading order.
export function makeRows(words: Word[], page: number): Row[] {
  const rows: Row[] = [];
  for (const word of [...words].filter(w => w.text.trim()).sort((a,b) => b.y-a.y || a.x-b.x)) {
    let row = rows.find(r => Math.abs(r.y-word.y) < 2.5);
    if (!row) { row = { text: "", words: [], y: word.y, page }; rows.push(row); }
    row.words.push(word);
  }
  for (const row of rows) { row.words.sort((a,b) => a.x-b.x); row.text = row.words.map(w => w.text).join(" ").replace(/\s+/g," ").trim(); }
  return rows;
}
const money = "([\\d][\\d.,]*[.,]\\d{2,4})";
export function decimal(value: string): number {
  let s = value.replace(/[^\d,.-]/g, "");
  if (s.lastIndexOf(",") > s.lastIndexOf(".")) s=s.replace(/\./g,"").replace(",", ".");
  else s=s.replace(/,/g,"");
  return Number(s);
}
export function extractOrder(company: string, rows: Row[], options: {usedOcr?: boolean} = {}): Order {
  if (isPilgrims(company)) company = "Pilgrims";
  if (company === "Cargil Irapuato") company = "Cargill";
  if (company === "NutecJCF") company = "NutecGaleras";
  const text = rows.map(r=>r.text).join("\n");
  if(company==="Taylor farms" && /Promised Date/.test(text) && /PO-\d{2}-\d+/.test(text)) company="Taylor farms v2";
  const match = (re: RegExp) => text.match(re)?.[1]?.trim() || "";
  const amount = (label: string) => match(new RegExp(label+"\\s*[:$]?\\s*\\$?\\s*"+money,"im"));
  const result: Order = { id:"",date:"",currency:"",materials:[],subtotal:"",tax:"",total:"",warnings:[] };
  const signatures: Record<string,RegExp> = { Bachoco:/COMPRA PARA Bachoco/i,Campi:/COMPRA PARA Campi/i,JhonsonMatthey:/Johnson Matthey|JM Indirect/i,inovatelia:/INNOVATELIA/i,Ceat:/CEAT Design/i,OMG:/OMG International/i,MEI:/MEI Queretaro|MEI Querétaro/i,MartinSproket:/SPROCKET & GEAR/i };
  Object.assign(signatures, { Cargill:/Cargill|AGRIBRANDS PURINA/i,Calquimica:/CAL QUIMICA MEXICANA/i,Agrogen:/AGROGEN/i,Daltile:/DAL-TILE MEXICO/i,Ceypabasa:/CELULOSA Y PAPEL DEL BAJ[IÍ]O/i });
  Object.assign(signatures,newClientSignatures,moreSignatures,pcpSignatures,pcpSixSignatures,dsaAudaceSignatures, { PPG: ppgSignature, Nutribaq: nutribaqSignature, Pilgrims: pilgrimsSignature });
  if (!text.trim()) { result.warnings.push("No se reconoció texto en el documento. Valida la calidad del PDF a la derecha."); return result; }
  if (!signatures[company]?.test(text)) { result.warnings.push("El documento no coincide con la empresa seleccionada. Cambia la empresa y vuelve a cargarlo."); return result; }
  result.date=match(/(?:^|\s)Fecha\s*[:|]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/im);
  result.currency=match(/(?:Moneda|Currency)\s*:?\s*(MXP|MXN|USD|EUR|DOLAR AMERICANO)/i);
  result.subtotal=amount("\\bSubtotal"); result.tax=amount("\\bI\\.?V\\.?A\\.?(?:\\s*16%)?"); result.total=amount("(?:^|\\s)(?:Gran\\s+)?Total");
  if (company === "Bachoco" || company === "Campi") {
    result.id=match(/^No\.\s*\|?\s*(\d+)/im);
    result.subtotal=amount("^Total");result.total=amount("Gran Total");
  } else if (company === "JhonsonMatthey") {
    result.id=match(/PO Number\s+(\d+)/i); result.date=match(/PO Date\s+([\d.]+)/i);
    result.subtotal=amount("Net Value"); result.tax=amount("^Tax"); result.total=amount("^Total");
  } else if (company === "inovatelia") result.id=match(/Orden de compra\s+(\d+)/i);
  else if (company === "Ceat") {
    result.id=match(/\b(\d{6}-\d{3})\b/);
    const index=rows.findIndex(r=>/Fecha:/.test(r.text));
    result.date=rows.slice(index,index+3).flatMap(r=>r.words).filter(w=>w.x>.75).map(w=>w.text).join(" ").match(/\d{2}\/\d{2}\/\d{4}/)?.[0]||"";
  }
  else if (company === "OMG") {result.id=match(/Orden de Compra:\s*([^\n]+)/i); result.date=match(/Fecha:\s*([^\n]+)/i);result.total=amount("GRAN TOTAL");}
  else if (company === "MEI") {
    result.id=match(/Document Number\s+(\d+)/i);result.date=match(/\bDate\s+(\d{2}\/\d{2}\/\d{4})/);
    result.subtotal=amount("Net Value");result.total=match(new RegExp("Total Amount\\s+(?:MXN|USD|EUR)\\s+"+money,"i"));
    result.warnings.push("La fecha de MEI está expresada en mes/día/año.");
  } else if (company === "MartinSproket") {
    result.id=match(/Número\s+(P\d+)/i);
    const totals=text.match(new RegExp("(MXN|USD|EUR)\\s+"+money+"\\s+"+money+"\\s+"+money+"\\s+"+money));
    if(totals) {result.currency=totals[1];result.subtotal=totals[2];result.tax=totals[4];result.total=totals[5];}
  }
  const cell=(r:Row,a:number,b:number) => r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(" ").replace(/\s+/g," ").trim();
  let active=false; let last:Material|undefined;
  for(const r of rows) {
    if (/Pos\. Material|Item No|ITEM CÓDIGO|No\. Proyecto|Codigo de Producto|Item Material\/Description|de línea.*Descripción/.test(r.text)) {active=true;last=undefined;continue;}
    if (/^(?:Net Value|INSTRUCTIONS TO VENDOR|Total|Subtotal|Valor antes|Notes:|Elaboró|Contact for Purchase Order|Page \d|Página|PURCHASE ORDER|Purchase Order)/i.test(r.text)) {active=false;last=undefined;continue;}
    if(!active)continue;
    let m:RegExpMatchArray|null=null;
    let item:Material|undefined;
    const base={code:"",unit:"",description:"",quantity:"",price:"",amount:"",page:r.page, sourceY: r.y};
    if(company==="Bachoco"||company==="Campi") {
      m=r.text.match(new RegExp("^(\\d{5})\\s+(?:(REF\\S+)\\s+)?(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+(\\S+)\\s+"+money+"\\s+"+money+"$"));
      if(m)item={...base,position:m[1],code:m[2]||"",description:m[3],quantity:m[4],unit:m[5],price:m[6],amount:m[7]};
    } else if(company==="JhonsonMatthey") {
      m=r.text.match(new RegExp("^(\\d{2,5})\\s+(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+(AU|EA)\\s+"+money+"(?:\\s+\\d{2}\\.\\d{2}\\.\\d{4})?\\s+"+money+"$"));
      if(m)item={...base,position:m[1],description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6],detail:m[1].length<5};
      else if(r.words.length && r.words.every(w=>w.x>=.28&&w.x<.47)) {
        const target=last || result.materials.at(-1);
        if(target)target.description+=" "+r.text;
      }
    } else if(company==="Ceat") {
      m=r.text.match(new RegExp("^(\\d+)\\s+(\\S+)\\s+(.+?)\\s+(\\d+\\.\\d+)\\s+\\(?\\$?\\s*"+money+"\\s*\\)?\\s+\\$?\\s*"+money+"$"));
      if(m)item={...base,position:m[1],code:m[2],description:m[3],quantity:m[4],price:m[5],amount:m[6]};
    } else if(company==="inovatelia") {
      m=r.text.match(new RegExp("^(\\d+)\\s+.+?\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"$"));
      if(m)item={...base,position:m[1],description:cell(r,.18,.61),quantity:m[2],unit:m[3],price:m[4],amount:m[5]};
    } else if(company==="OMG") {
      m=r.text.match(new RegExp("^(\\S+)\\s+(.+?)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s+\\$?\\s*"+money+"\\s+\\$?\\s*"+money+"$"));
      if(m)item={...base,position:m[1],code:m[1],description:m[2],unit:m[3],quantity:m[4],price:m[5],amount:m[6]};
    } else if(company==="MEI") {
      m=r.text.match(new RegExp("^(\\d+)\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s*/1\\s*/EA\\s+"+money+"$"));
      if(m)item={...base,position:m[1],quantity:m[2],unit:m[3],price:m[4],amount:m[5]};
      else if(last && !/^_+$/.test(r.text))last.description+=" "+r.text;
    } else if(company==="MartinSproket") {
      m=r.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+\\d{2}/\\d{2}/\\d{4}\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"$"));
      if(m)item={...base,position:m[1],description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6]};
      else if(last) {const more=cell(r,.33,.535);if(more)last.description+=" "+more;}
    }
    if(item) {item.description=item.description.trim();result.materials.push(item);last=item;}
  }
  extractAdditional(company, rows, result);
  extractMore(company, rows, result);
  extractPcp(company, rows, result);
  extractPcpSix(company, rows, result);
  extractDsaAudace(company, rows, result);
  extractPpg(company, rows, result);
  extractNutribaq(company, rows, result);
  extractPilgrims(company, rows, result);
  extractNewClients(company,rows,result);
  const commitment = extractCommitment(company, rows, result.date);
  result.commitmentDate = commitment.date;
  result.commitmentEvidence = commitment.evidence;
  result.warnings.push(...commitment.warnings);
  result.warnings.push(...assignCommitments(company, result.materials, commitment.evidence));
  resolveSubtotal(result,Boolean(options.usedOcr)||["Agrogen","Grupo Abrego","PolloQro","Nutribaq"].includes(company));
  for(const [label,value] of [["OC",result.id],["Fecha",result.date],["Moneda",result.currency],["Subtotal",result.subtotal],["IVA",result.tax],["Total",result.total]]) if(!value)result.warnings.push(`${label}: no encontrado de forma explícita. Validar en el PDF.`);
  if(!result.materials.length) result.warnings.push("No se pudieron identificar partidas con esta plantilla.");
  if(result.materials.some(m=>m.detail))result.warnings.push("Las subpartidas se muestran como detalle y no se suman otra vez al subtotal.");
  if(result.subtotal&&result.tax&&result.total&&Math.abs(decimal(result.subtotal)+decimal(result.tax)-decimal(result.total))>.03)result.warnings.push("Subtotal + IVA no coincide con el total. Revisa descuentos, cargos u otros impuestos en el PDF.");
  const sum=result.materials.filter(m=>!m.detail).reduce((s,m)=>s+decimal(m.amount),0);
  if(result.materials.length&&result.subtotal&&Math.abs(sum-decimal(result.subtotal))>.03)result.warnings.push("La suma de partidas no coincide con el subtotal. Revisa posibles partidas faltantes o ajustes.");
  return result;
}









