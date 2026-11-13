import {groupMaterials,inheritedCode,type OrderSubitem} from "./order-subitems";
import Decimal from "decimal.js";
import { CatalogError, record } from "./catalog-model";
import type { Order } from "./extract-order";
import { normalizeOrderDate } from "./order-dates";
import { summarizeOrderWarnings } from "./order-review";

export type OrderItem = { id: string; shipped_quantity?: string; operations_locked_at?: string | null; subitems: OrderSubitem[]; kind: "parts" | "service"; code: string; description: string; unit: string; quantity: string; unit_price: string; discount: string; commitment_date: string; fulfillment: "pending" | "partial" | "complete"; completed_date: string };
export type OrderSource = { filename: string; size: number; extracted: Order };
export type PurchaseOrderDraft = {
  id: string; revision: number; business_id: string; client_id: string; number: string;
  kind: "parts" | "service" | "mixed"; status: "draft" | "confirmed" | "cancelled";
  fulfillment: "pending" | "partial" | "complete";
  order_date: string; commitment_date: string; completed_date: string;
  currency: "MXN" | "USD" | "EUR"; notes: string; delivery_address: string;
  cancellation_reason: string; tax: string; items: OrderItem[]; source: OrderSource | null;
};
export type SavedOrder = PurchaseOrderDraft & {
  subtotal: string; total: string; created_at: string; updated_at: string;
  client_snapshot: Record<string, string>; business_snapshot: Record<string, string>;
};
export type OrderSummary = Pick<SavedOrder, "id" | "number" | "kind" | "status" | "fulfillment" | "order_date" | "commitment_date" | "currency" | "total" | "client_snapshot" | "revision">;
export type OrderEvent = { actor_id?: string | null; actor_snapshot?: { full_name: string; username: string } | null; id: string; revision: number; action: string; occurred_at: string; snapshot: { order: Omit<SavedOrder, "items">; items: OrderItem[] } };
export const statusLabels = { draft: "Borrador", confirmed: "Registrada", cancelled: "Cancelada" };
export function fulfillmentLabel(kind: string, state: string) {
  if (kind === "mixed") return state === "complete" ? "Completada" : state === "partial" ? "En proceso" : "Pendiente";
  return state === "complete" ? (kind === "service" ? "Realizado" : "Enviada") : state === "partial" ? (kind === "service" ? "En proceso" : "Envío parcial") : "Pendiente";
}
export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function blankItem(): OrderItem { return { id: crypto.randomUUID(), subitems: [], kind: "parts", code: "", description: "", unit: "PZA", quantity: "1", unit_price: "0", discount: "0", commitment_date: "", fulfillment: "pending", completed_date: "" }; }
export function deliverySummary(items: OrderItem[]) {
  const complete=items.length>0 && items.every(i=>i.fulfillment==="complete");
  const fulfillment: OrderItem["fulfillment"]=complete ? "complete" : items.some(i=>i.fulfillment!=="pending") ? "partial" : "pending";
  const dates=items.filter(i=>i.fulfillment!=="complete").map(i=>i.commitment_date).filter(Boolean).sort();
  const kind: PurchaseOrderDraft["kind"] = items.every(i=>i.kind==="service") ? "service" : items.some(i=>i.kind==="service") ? "mixed" : "parts";
  return { kind, fulfillment, commitment_date: dates[0]??"", completed_date: complete ? items.map(i=>i.completed_date).sort().at(-1)??"" : "" };
}
export function deliveryWarnings(items: OrderItem[], orderDate: string) {
  return items.flatMap((item,index)=>!item.commitment_date ? [`Partida ${index+1}: no se encontró o no se ha capturado la fecha de entrega.`] : orderDate && item.commitment_date<orderDate ? [`Partida ${index+1}: la fecha de entrega ${item.commitment_date.split("-").reverse().join("/")} es anterior a la emisión de la OC. Se conserva la fecha.`] : []);
}
export function blankOrder(business: string): PurchaseOrderDraft {
  return { id: crypto.randomUUID(), revision: 0, business_id: business, client_id: "", number: "", kind: "parts", status: "confirmed", fulfillment: "pending", order_date: localDate(), commitment_date: "", completed_date: "", currency: "MXN", notes: "", delivery_address: "", cancellation_reason: "", tax: "0", items: [blankItem()], source: null };
}
function decimal(value: unknown, scale: number, digits: number, name: string): string {
  if (typeof value !== "string" || !new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,${scale}})?$`).test(value)) throw new CatalogError(`${name}: usa un número positivo con punto decimal (máximo ${scale} decimales).`);
  return new Decimal(value).toFixed();
}
function text(row: Record<string, unknown>, key: string, max: number, required = false) {
  if (typeof row[key] !== "string" || row[key].length > max || (required && !row[key].trim())) throw new CatalogError(`Revisa el campo ${key}.`);
  return row[key].trim();
}
function date(value: string, required = false) {
  if (!value && !required) return value;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2199-12-31" || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new CatalogError("Revisa las fechas de la orden.");
  return value;
}
export function totals(items: Pick<OrderItem,"quantity"|"unit_price"|"discount">[], tax: string) {
  const amounts = items.map(item => new Decimal(item.quantity).mul(item.unit_price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).minus(item.discount));
  const subtotal = amounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0));
  return { amounts: amounts.map(a => a.toFixed(2)), subtotal: subtotal.toFixed(2), total: subtotal.plus(tax).toFixed(2) };
}
export function validateOrder(value: unknown): PurchaseOrderDraft {
  const row = record(value);
  if (typeof row.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0) throw new CatalogError("Versión de la orden no válida.");
  if (!["pcp", "taasa", "jose"].includes(String(row.business_id))) throw new CatalogError("Razón social no válida.");
  if (!["parts", "service", "mixed"].includes(String(row.kind)) || !Object.hasOwn(statusLabels, String(row.status)) || !["pending", "partial", "complete"].includes(String(row.fulfillment)) || !["MXN", "USD", "EUR"].includes(String(row.currency))) throw new CatalogError("Tipo, estado o moneda no válidos.");
  if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 200) throw new CatalogError("La orden requiere entre 1 y 200 partidas.");
  if(typeof row.number!=="string"||!row.number.trim())throw new CatalogError("El número de OC es obligatorio.");
  if(!row.order_date)throw new CatalogError("La fecha de OC es obligatoria.");
  const itemIds = new Set<string>();
  const items = row.items.map((value,index): OrderItem => {
    const item = record(value);
    if (typeof item.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id) || itemIds.has(item.id.toLowerCase())) throw new CatalogError("Identificador de partida no válido o repetido. Recarga la orden.");
    const id = item.id.toLowerCase();
    itemIds.add(id);
    if (item.kind !== "parts" && item.kind !== "service") throw new CatalogError("Tipo de partida no válido.");
    const result = { code: text(item, "code", 100), description: text(item, "description", 2000, true), unit: text(item, "unit", 30), quantity: decimal(item.quantity, 4, 9, "Cantidad"), unit_price: decimal(item.unit_price, 4, 9, "Precio"), discount: decimal(item.discount, 2, 16, "Descuento") };
    if (new Decimal(result.quantity).lte(0) || new Decimal(totals([result], "0").subtotal).lt(0)) throw new CatalogError("Cada partida necesita cantidad mayor que cero y descuento no mayor que su importe.");
    const fulfillment = text(item,"fulfillment",10);
    if(!["pending","partial","complete"].includes(fulfillment)) throw new CatalogError("Estado de envío de partida no válido.");
    const completed_date=date(text(item,"completed_date",10));
    if((fulfillment==="complete")!==!!completed_date) throw new CatalogError("Indica la fecha real en cada partida enviada o realizada.");
    if(completed_date && completed_date<String(row.order_date)) throw new CatalogError("La fecha real de una partida no puede ser anterior a la orden.");
    if(!Array.isArray(item.subitems)||item.subitems.length>200) throw new CatalogError("Revisa las subpartidas (máximo 200 por partida).");
    const subitems=item.subitems.map(raw=>{
      const child=record(raw);
      const numeric=(key:string,scale:number,digits:number)=>child[key]==="" ? "" : decimal(child[key],scale,digits,"Subpartida");
      const subitem={code:text(child,"code",100),description:text(child,"description",2000,true),unit:text(child,"unit",30),quantity:numeric("quantity",4,9),unit_price:numeric("unit_price",4,9),amount:numeric("amount",2,16)};
      if(subitem.quantity && new Decimal(subitem.quantity).lte(0))throw new CatalogError("Cantidad de subpartida no válida.");
      return subitem;
    });
    const code=inheritedCode(result.code,subitems);
    if(item.kind==="parts"&&(!code||code.length>80))throw new CatalogError(`Partida ${index+1}: el código de refacción es obligatorio (máximo 80 caracteres).`);
    if(!item.commitment_date)throw new CatalogError(`Partida ${index+1}: la fecha de entrega/servicio es obligatoria.`);
    return { ...result, id, code, subitems, kind: item.kind, commitment_date: date(text(item,"commitment_date",10),true), fulfillment: fulfillment as OrderItem["fulfillment"], completed_date };
  });
  const result: PurchaseOrderDraft = {
    id: row.id, revision: Number(row.revision), business_id: String(row.business_id), client_id: text(row, "client_id", 500, true), number: text(row, "number", 100, true),
    kind: row.kind as PurchaseOrderDraft["kind"], status: row.status as PurchaseOrderDraft["status"], fulfillment: row.fulfillment as PurchaseOrderDraft["fulfillment"], currency: row.currency as PurchaseOrderDraft["currency"],
    order_date: date(text(row, "order_date", 10), true), commitment_date: date(text(row, "commitment_date", 10)), completed_date: date(text(row, "completed_date", 10)),
    notes: text(row, "notes", 4000), delivery_address: text(row, "delivery_address", 1000), cancellation_reason: text(row, "cancellation_reason", 1000), tax: decimal(row.tax, 2, 16, "IVA"), items, source: null,
  };
  Object.assign(result,deliverySummary(items));
  if (result.status === "draft" && result.fulfillment !== "pending") throw new CatalogError("Registra la orden antes de reportar avances.");
  if (result.status === "cancelled" && !result.cancellation_reason) throw new CatalogError("Indica el motivo de cancelación.");
  if (new Decimal(totals(items, result.tax).total).gte("10000000000000000")) throw new CatalogError("El importe supera el límite permitido.");
  if (row.source !== null) {
    const source = record(row.source);
    if (typeof source.filename !== "string" || source.filename.length > 500 || typeof source.size !== "number" || !Number.isSafeInteger(source.size) || source.size < 0 || source.size > 25 * 1024 * 1024 || JSON.stringify(source).length > 75000) throw new CatalogError("Referencia del PDF no válida.");
    const extracted = record(source.extracted);
    if (!Array.isArray(extracted.materials) || !Array.isArray(extracted.warnings) || extracted.warnings.some(w => typeof w !== "string")) throw new CatalogError("Lectura del PDF no válida.");
    result.source = { filename: source.filename, size: source.size, extracted: extracted as Order };
  }
  return result;
}
// Extraction is a suggestion; dates follow the selected template's convention.
export function extractedNumber(value: string) {
  let clean = value.replace(/[^\d.,-]/g, "");
  if (!clean) return "";
  if (clean.includes(",") && clean.includes(".")) clean = clean.lastIndexOf(",") > clean.lastIndexOf(".") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  else if (clean.includes(",")) clean = /^\d{1,3}(,\d{3})+$/.test(clean) ? clean.replace(/,/g, "") : clean.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(clean) ? new Decimal(clean).toFixed() : "";
}
export function draftFromExtraction(business: string, client: string, extracted: Order, file: { name: string; size: number }, template = ""): PurchaseOrderDraft {
  const draft: PurchaseOrderDraft = { ...blankOrder(business), client_id: client, number: extracted.id, commitment_date: normalizeOrderDate(extracted.commitmentDate ?? "", "manual"), order_date: normalizeOrderDate(extracted.date, template), currency: ["MXN", "USD", "EUR"].includes(extracted.currency) ? extracted.currency as PurchaseOrderDraft["currency"] : "MXN", tax: extractedNumber(extracted.tax),
    items: groupMaterials(extracted.materials).map(({main:m,details}) => ({ ...blankItem(), kind: m.kind ?? "parts", code: inheritedCode(m.code,details), description: m.description, unit: m.unit, quantity: extractedNumber(m.quantity), unit_price: extractedNumber(m.price), discount: "0", commitment_date: normalizeOrderDate(m.commitmentDate ?? extracted.commitmentDate ?? "", "manual"), subitems:details.map(d=>({code:d.code,description:d.description,unit:d.unit,quantity:extractedNumber(d.quantity),unit_price:extractedNumber(d.price),amount:extractedNumber(d.amount)})) })),
    source: { filename: file.name, size: file.size, extracted } };
  const warnings: string[] = [];
  draft.items.forEach((item,i)=>{if(!item.code && new Set(item.subitems.map(s=>s.code).filter(Boolean)).size>1)warnings.push(`Partida ${i+1}: hay varios códigos de subpartida; se conservan en su detalle. Selecciona el código principal si corresponde.`);});
  let subtotal = extractedNumber(extracted.subtotal);
  if (!subtotal && draft.items.length) {
    try { subtotal = totals(draft.items, "0").subtotal; } catch { /* Missing prices require manual review. */ }
  }
  const expected = subtotal && new Decimal(subtotal).gte(0) ? new Decimal(subtotal).mul("0.16").toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : null;
  if (!draft.tax) {
    if (expected) {
      draft.tax = expected.toFixed(2);
      warnings.push("La OC no contiene IVA, se agregó automáticamente favor de verificar.");
    } else warnings.push("La OC no contiene IVA y no se pudo calcular el 16% porque falta un subtotal válido. Captura el IVA y verifica las partidas.");
  } else if (new Decimal(draft.tax).isZero()) {
    warnings.push("La OC contiene IVA en 0. Se conserva el valor del documento; favor de verificar.");
  } else if (expected && new Decimal(draft.tax).lt(expected)) {
    warnings.push(`El IVA de la OC es menor al 16% del subtotal (${expected.toFixed(2)}). Se conserva el valor del documento; favor de verificar.`);
  }
  if (warnings.length) draft.source = { filename: file.name, size: file.size, extracted: { ...extracted, warnings: [...extracted.warnings, ...warnings] } };
  return draft;
}

export function orderReviewWarnings(draft: PurchaseOrderDraft | null) {
  if (!draft || (!draft.source && !draft.revision)) return [];
  return summarizeOrderWarnings([...(draft.source?.extracted.warnings ?? []).filter(w => !w.startsWith("Fecha compromiso:")), ...deliveryWarnings(draft.items, draft.order_date)]);
}
