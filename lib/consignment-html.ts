import Decimal from "decimal.js";
import type { Order } from "./extract-order";
export const consignmentCompany = "Pilgrims Tepeji Consigna";
export async function readHtmlFile(file: File) {
  const bytes = await file.arrayBuffer();
  const prefix = new TextDecoder().decode(bytes.slice(0,1024));
  return new TextDecoder(/charset\s*=\s*["']?windows-1252/i.test(prefix) ? "windows-1252" : "utf-8").decode(bytes);
}
export function parseConsignmentHtml(html:string) {
  const doc=new DOMParser().parseFromString(html,"text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta,img,svg").forEach(e=>e.remove());
  const clean=(e:Element)=> (e.textContent??"").replace(/\s+/g," ").trim();
  const lines=Array.from(doc.querySelectorAll("nobr")).map(clean).filter(Boolean);
  const rows=Array.from(doc.querySelectorAll("tr")).map(r=>Array.from(r.children).filter(c=>c.tagName==="TD"||c.tagName==="TH").map(clean));
  return {lines,rows};
}
export function extractConsignment(data:ReturnType<typeof parseConsignmentHtml>):Order {
  if(!data.lines.some(l=>/Reporte De Consumos De Material en Consignaci[oó]n/i.test(l)) || !data.lines.some(l=>/Pilgrims/i.test(l))) throw new Error("El documento no corresponde a Pilgrims Tepeji Consigna.");
  const header=data.rows.findIndex(r=>r.includes("Documento material")&&r.includes("Referencia"));
  if(header<0)throw new Error("No se encontró la tabla de consumos.");
  const headings=data.rows[header];
  const get=(r:string[],label:string)=>r[headings.indexOf(label)]??"";
  const movements=data.rows.slice(header+1).filter(r=>/^\d+$/.test(get(r,"Documento material")));
  if(!movements.length)throw new Error("No se encontraron movimientos de consumo.");
  const references=[...new Set(movements.map(r=>get(r,"Referencia")))];
  const currencies=[...new Set(movements.map(r=>get(r,"Mon.")))];
  if(references.length!==1||!references[0]||currencies.length!==1)throw new Error("El reporte contiene referencias o monedas distintas. Separa las órdenes antes de importarlas.");
  const num=(s:string)=>new Decimal(s.replace(/,/g,""));
  const index=data.lines.findIndex(l=>l==="Fecha:");
  const result:Order={id:references[0],date:data.lines[index+1]?.match(/\d{2}\.\d{2}\.\d{4}/)?.[0]??"",currency:currencies[0],materials:[],subtotal:"",tax:"",total:"",warnings:["Reporte de consumos en consignación registrado como OC. Las fechas de los movimientos no se utilizan como fecha de entrega."]};
  let subtotal=new Decimal(0),total=new Decimal(0);
  for(const [i,r] of movements.entries()) {
    const quantity=num(get(r,"Cantidad entregada para Liquidar")),amount=num(get(r,"Importe")),gross=num(get(r,"Importe To"));
    if(!quantity.gt(0)||amount.lt(0)||gross.lt(amount))throw new Error("Revisa las cantidades e importes del reporte.");
    subtotal=subtotal.plus(amount);total=total.plus(gross);
    result.materials.push({position:String(i+1),code:get(r,"Material"),description:get(r,"Texto breve material"),quantity:quantity.toFixed(),unit:get(r,"Un.medida"),price:amount.div(quantity).toDecimalPlaces(4).toFixed(),amount:amount.toFixed(2),page:1,commitmentDate:""});
  }
  result.subtotal=subtotal.toFixed(2);result.total=total.toFixed(2);
  // The report has no explicit IVA field; the existing import policy calculates it and warns.
  result.warnings.push("El importe total del reporte incluye una diferencia respecto al importe base; verifica que corresponda al IVA calculado.");
  return result;
}
