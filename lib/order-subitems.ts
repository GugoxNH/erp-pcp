import type { Material } from "./extract-order";

export type OrderSubitem = { code:string; description:string; quantity:string; unit:string; unit_price:string; amount:string };
export function blankSubitem():OrderSubitem {return {code:"",description:"",quantity:"1",unit:"PZA",unit_price:"",amount:""};}
export function groupMaterials(materials:Material[]) {
  const groups:{main:Material;details:Material[]}[]=[];
  for(const material of materials) {
    if(material.detail && !groups.length) throw new Error("Se encontró una subpartida sin partida principal. Revisa el documento antes de capturarlo.");
    if(material.detail && groups.length) groups[groups.length-1].details.push(material);
    else groups.push({main:material,details:[]});
  }
  return groups;
}
export function inheritedCode(code:string,details:{code:string}[]) {
  if(code.trim())return code;
  const codes=[...new Set(details.map(d=>d.code.trim()).filter(Boolean))];
  return codes.length===1 ? codes[0] : "";
}
