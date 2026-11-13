import Decimal from "decimal.js";
import { fulfillmentLabel, statusLabels, type OrderEvent } from "./purchase-orders";

const fields: Record<string,string> = { number:"Número de OC", status:"Estado", order_date:"Fecha de la OC", currency:"Moneda", notes:"Observaciones", delivery_address:"Dirección / lugar", cancellation_reason:"Motivo de cancelación", tax:"IVA", subtotal:"Subtotal", total:"Total" };
const itemFields: Record<string,string> = { shipped_quantity:"Cantidad enviada desde almacén", code:"Código", description:"Descripción", unit:"Unidad", quantity:"Cantidad", unit_price:"Precio unitario", discount:"Descuento", kind:"Tipo", commitment_date:"Fecha de entrega", fulfillment:"Estado de envío / avance", completed_date:"Fecha real" };
const numeric = new Set(["shipped_quantity","quantity","unit_price","discount","tax","subtotal","total"]);
function value(key:string, raw:unknown, kind:string) {
  if(raw === null || raw === undefined || raw === "") return "Sin definir";
  const text=String(raw);
  if(numeric.has(key)) { try { return new Decimal(text).toFixed(); } catch { return text; } }
  if(key.endsWith("_date")) return text.split("-").reverse().join("/");
  if(key==="status") return statusLabels[text as keyof typeof statusLabels] ?? text;
  if(key==="kind") return text==="parts" ? "Refacciones" : text==="service" ? "Servicio" : "Mixta";
  if(key==="fulfillment") return fulfillmentLabel(kind,text);
  return text;
}
export function orderChanges(event:OrderEvent, previous?:OrderEvent): string[] {
  if(event.action==="created") return ["Registro inicial de la orden."];
  if(!previous || previous.revision!==event.revision-1) return ["No está disponible la versión anterior para comparar."];
  const changes:string[]=[];
  const before=previous.snapshot.order, after=event.snapshot.order;
  for(const [key,label] of Object.entries(fields)) {
    const a=value(key,before[key as keyof typeof before],before.kind), b=value(key,after[key as keyof typeof after],after.kind);
    if(a!==b) changes.push(`${label}: ${a} → ${b}`);
  }
  // Legacy snapshots have no IDs. Do not invent historical identities during migration.
  const oldItems=previous.snapshot.items, newItems=event.snapshot.items;
  const stable=oldItems.every(i=>i.id)&&newItems.every(i=>i.id);
  const pairs=stable ? [
    ...newItems.map((b,i)=>({a:oldItems.find(a=>a.id===b.id),b,i,oldIndex:oldItems.findIndex(a=>a.id===b.id)})),
    ...oldItems.flatMap((a,i)=>newItems.some(b=>b.id===a.id)?[]:[{a,b:undefined,i,oldIndex:i}]),
  ] : Array.from({length:Math.max(oldItems.length,newItems.length)},(_,i)=>({a:oldItems[i],b:newItems[i],i,oldIndex:i}));
  for(const {a,b,i,oldIndex} of pairs) {
    if(!a && b) { changes.push(`Partida ${i+1} agregada: ${b.description}`); continue; }
    if(!b && a) { changes.push(`Partida ${oldIndex+1} eliminada: ${a.description}`); continue; }
    if(!a || !b)continue;
    if(stable && oldIndex!==i)changes.push(`Partida ${oldIndex+1} movida a la posición ${i+1}: ${b.description}`);
    for(const [key,label] of Object.entries(itemFields)) {
      const fallback=(item:typeof a, order:typeof before)=>item[key as keyof typeof item] ?? (key==="shipped_quantity" ? "0" : (["kind","commitment_date","fulfillment","completed_date"].includes(key) ? order[key as keyof typeof order] : ""));
      const old=value(key,fallback(a,before),a.kind??before.kind), next=value(key,fallback(b,after),b.kind??after.kind);
      if(old!==next) changes.push(`Partida ${i+1} · ${label}: ${old} → ${next}`);
    }
  }
  for(const {a,b,i} of pairs) {
    const old=a?.subitems??[],next=b?.subitems??[];
    for(let j=0;j<Math.max(old.length,next.length);j++) {
      if(!old[j]) {changes.push(`Subpartida ${i+1}.${j+1} agregada: ${next[j].description}`);continue;}
      if(!next[j]) {changes.push(`Subpartida ${i+1}.${j+1} eliminada: ${old[j].description}`);continue;}
      for(const key of ["code","description","quantity","unit","unit_price","amount"] as const) {
        const a=value(key,old[j][key],""),b=value(key,next[j][key],"");
        if(a!==b)changes.push(`Subpartida ${i+1}.${j+1} · ${itemFields[key]??"Importe"}: ${a} → ${b}`);
      }
    }
  }
  if(JSON.stringify(before.source)!==JSON.stringify(after.source)) changes.push("Documento de origen / datos de lectura actualizados.");
  if(event.action.endsWith("_migrated")) changes.unshift("Actualización automática de la estructura de las partidas.");
  return changes.length ? changes : ["Sin cambios en los datos de la orden."];
}
export function orderActor(event:OrderEvent) {
  if(event.actor_snapshot) return `${event.actor_snapshot.full_name} (@${event.actor_snapshot.username})`;
  if(event.action.endsWith("_migrated") && !event.actor_id) return "Sistema";
  return "Usuario no disponible";
}
