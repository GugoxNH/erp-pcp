import type { Material, Order, Row } from "./extract-order";
import { normalizeOrderDate } from "./order-dates.ts";

export const newClientSignatures: Record<string, RegExp> = {
  Grupak: /GRUPAK OPERACIONES/i,
  SuKarne: /SUKARNE AGROINDUSTRIAL/i,
  "Taylor farms v2": /Taylor Farms de M[eé]xico/i,
};
const cell = (r:Row,a:number,b:number) => r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(" ").trim();
const date = /\d{2}[/.]\d{2}[/.]\d{4}/;
export function extractNewClients(company:string,rows:Row[],result:Order) {
  if(!newClientSignatures[company]) return;
  const text=rows.map(r=>r.text).join("\n");
  const get=(re:RegExp)=>text.match(re)?.[1]??"";
  result.materials=[];
  if(company==="Taylor farms v2") {
    result.id=get(/\b(PO-\d{2}-\d+)\b/);
    const header=rows.findIndex(r=>/Fecha ordenada.*Promised Date/.test(r.text));
    const next=header<0?undefined:rows[header+1];
    result.date=next ? normalizeOrderDate(cell(next,.50,.72).match(date)?.[0]??"","manual") : "";
    result.currency=get(/Vendor currency is (MXN|USD|EUR)/i);
    // This layout wraps even the decimal digits into the next visual row.
    const amount=(label:RegExp)=>{
      const i=rows.findIndex(r=>label.test(r.text));
      if(i<0)return "";
      let value=cell(rows[i],.85,1);
      const continuation=rows[i+1];
      if(continuation?.page===rows[i].page && rows[i].y-continuation.y<15 && /^\d{1,2}$/.test(continuation.text)) value+=continuation.text;
      return value.replace(/MXN|USD|EUR|\s/g,"");
    };
    result.subtotal=amount(/^Subtotal\b/);result.tax=amount(/^Impuesto:/);result.total=amount(/^Gran total:/);
    let last:Material|undefined,active=false;
    for(const row of rows) {
      if(/^Línea ID de artículo/.test(row.text)){active=true;last=undefined;continue;}
      if(/^Subtotal|^Notas|^Aprobado por/.test(row.text)){active=false;last=undefined;}
      if(!active)continue;
      const pos=cell(row,0,.12).match(/^(\d+)\)$/);
      if(pos) {
        last={position:pos[1],code:cell(row,.12,.24),description:cell(row,.24,.46),unit:cell(row,.57,.63),quantity:cell(row,.63,.70),price:cell(row,.70,.79).replace(/MXN|USD|EUR/g,""),amount:cell(row,.85,1).replace(/MXN|USD|EUR/g,""),page:row.page,sourceY:row.y};
        result.materials.push(last);
      } else if(last && row.page===last.page && last.sourceY!-row.y<20) {
        const description=cell(row,.24,.46);if(description)last.description+=" "+description;
        const price=cell(row,.70,.79),amount=cell(row,.85,1);
        if(/^\d{1,2}$/.test(price))last.price+=price;
        if(/^\d{1,2}$/.test(amount))last.amount+=amount;
      }
    }
    return;
  }
  result.id=company==="Grupak" ? get(/Orden de Compra:\s*(\d+)/i) : rows.find(r=>r.words.some(w=>w.x>.7&&/^\d{10}$/.test(w.text)))?.words.find(w=>w.x>.7&&/^\d{10}$/.test(w.text))?.text??"";
  if(company==="Grupak") result.date=get(/\bFecha:\s*(\d{2}\.\d{2}\.\d{4})/);
  else {
    const i=rows.findIndex(r=>/Fecha de Emisi[oó]n/.test(r.text));
    result.date=i<0?"":rows.slice(i+1,i+4).filter(r=>r.page===rows[i].page).map(r=>cell(r,.8,1)).join(" ").match(date)?.[0]??"";
  }
  result.currency=get(/\b(MXN|USD|EUR)\b/);
  result.subtotal=get(/\bSUBTOTAL\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  result.tax=get(/\bIVA\s*(?:16\s*%)?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  result.total=get(/\bTOTAL\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  let active=false,last:Material|undefined;
  for(const row of rows) {
    if(/PART: CANT:|^POS No\./.test(row.text)){active=true;last=undefined;continue;}
    if(/Instrucciones generales|Importe con Letra|Condiciones Generales/.test(row.text)){active=false;last=undefined;}
    if(!active)continue;
    const pos=cell(row,0,company==="Grupak"?.065:.08);
    if(/^\d{5}$/.test(pos)) {
      last=company==="Grupak" ? {position:pos,code:cell(row,.56,.76),quantity:cell(row,.065,.17),unit:cell(row,.17,.24),description:cell(row,.24,.56),price:cell(row,.76,.85),amount:cell(row,.88,1),page:row.page,sourceY:row.y} : {position:pos,code:cell(row,.08,.17),quantity:cell(row,.48,.57),unit:cell(row,.57,.61),description:cell(row,.17,.48),price:cell(row,.61,.68),amount:cell(row,.74,.85),page:row.page,sourceY:row.y};
      last.kind=last.unit==="SER" ? "service" : "parts";
      result.materials.push(last);
    } else if(last&&last.page===row.page) {
      if(company==="Grupak") { if(row.words.every(w=>w.x<.76))last.description+=" "+row.text; }
      else { const code=cell(row,.08,.17);if(/^\d+$/.test(code))last.code+=code;const more=cell(row,.17,.48);if(more)last.description+=" "+more; }
    }
  }
}
