import type {OrderItem} from "./purchase-orders";
export type OrderProduct = {id:string;sku:string;name:string;unit:string;codes:string[]};
export type MissingOrderProduct = {code:string;description:string;positions:number[]};
export function missingOrderProducts(items:OrderItem[],products:OrderProduct[]) {
  const known=new Set(products.flatMap(p=>p.codes.map(code=>code.trim().toUpperCase())));
  const missing=new Map<string,MissingOrderProduct>();
  items.forEach((item,index)=>{
    const code=item.code.trim(),key=code.toUpperCase();
    if(item.kind!=="parts"||known.has(key))return;
    if(!missing.has(key))missing.set(key,{code,description:item.description,positions:[]});
    missing.get(key)!.positions.push(index+1);
  });
  return [...missing.values()];
}
