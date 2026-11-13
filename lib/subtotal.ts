import type { Order } from "./extract-order";

// Validate monetary inputs before calculating; an absent IVA is never treated as zero.
function cents(value: string): number | null {
  const s=value.trim().replace(/^\$\s*/, "");
  const dot=/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2,6}$/.test(s);
  const comma=/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2,6}$/.test(s);
  if(!dot&&!comma)return null;
  const normalized=comma?s.replaceAll(".","").replace(",","."):s.replaceAll(",","");
  const valueInCents=Math.round(Number(normalized)*100);
  return Number.isSafeInteger(valueInCents)?valueInCents:null;
}

export function resolveSubtotal(order: Order, force: boolean) {
  const total=cents(order.total),tax=cents(order.tax),subtotal=cents(order.subtotal);
  const doubtful=subtotal===null||(total!==null&&tax!==null&&Math.abs(subtotal+tax-total)>3);
  if(!force&&!doubtful)return;
  if(total===null||tax===null||total<tax){
    order.warnings.push("No se pudo calcular el subtotal: se requieren Total e IVA válidos, con Total mayor o igual a IVA.");
    return;
  }
  order.subtotalOriginal=order.subtotal;
  order.subtotalSource="calculated";
  const locale=order.total.lastIndexOf(",")>order.total.lastIndexOf(".")?"de-DE":"en-US";
  order.subtotal=((total-tax)/100).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
  order.warnings.push(`Subtotal calculado: Total (${order.total}) − IVA (${order.tax}) = ${order.subtotal}.${order.subtotalOriginal&&subtotal!==total-tax?` Lectura original: ${order.subtotalOriginal}.`:""}`);
}

