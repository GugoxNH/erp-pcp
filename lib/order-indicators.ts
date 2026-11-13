export function mexicoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
export function deliveryIndicator(date:string|null, status:string, fulfillment:string, today=mexicoToday()) {
  if(!date || status!=="confirmed" || fulfillment==="complete")return "order-delivery";
  const days=(Date.parse(`${date}T00:00:00Z`)-Date.parse(`${today}T00:00:00Z`))/86400000;
  return days<0?"order-delivery overdue":days<=5?"order-delivery upcoming":"order-delivery";
}
export function orderIndicator(status:string,fulfillment:string) {
  if(status==="confirmed")return fulfillment==="complete"?{label:"Completada",className:"confirmed"}:{label:"Registrada",className:"registered-pending"};
  return {label:status==="cancelled"?"Cancelada":"Borrador",className:status};
}
