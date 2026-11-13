import type { Row, Order, Material } from "./extract-order";
export const nutribaqSignature=/NUTRIMENTOS[\s\S]*BALANCEADOS|Nutrimentos Balanceados/i;
export function extractNutribaq(company:string,rows:Row[],result:Order){
  if(company!=="Nutribaq")return;
  const text=rows.map(r=>r.text).join("\n");
  result.id=text.match(/\b(A\s+\d{4,})\b/)?.[1].replace(/\s+/g," ")||"";
  result.date=text.match(/FECHA DE EXPEDICI[ÓO]N:\s*(\d{1,2}-[a-z]+-\d{4})/i)?.[1]||"";
  result.currency=text.match(/\b(MXN|USD|EUR)\b/)?.[1]||"";
  result.subtotal=text.match(/SUMA\s*\$?\s*([\d,]+\.\d{2})/)?.[1]||"";
  result.tax=text.match(/^[IL1]\.?V\.?A\.?\s*\$?\s*([\d,]+\.\d{2})/im)?.[1]||"";
  result.total=text.match(/^TOTAL\s+(?!DE\b)[^\d\n]*([\d,]+\.\d{2})/im)?.[1]||"";
  result.materials=[];
  const cell=(r:Row,a:number,b:number)=>r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(" ").trim();
  let active=false,last:Material|undefined;
  for(const r of rows){
    if(/DESCRIPCI[ÓO]N Y PRESENTACI[ÓO]N/.test(r.text)){active=true;continue;}
    if(/TOTAL DE PARTIDAS|SUMA/.test(r.text)){active=false;last=undefined;}
    if(!active)continue;
    const position=cell(r,.05,.10),quantity=cell(r,.10,.16),price=cell(r,.82,.90).match(/[\d,]+\.\d{2}/)?.[0],amount=cell(r,.925,1).match(/[\d,]+\.\d{2}/)?.[0];
    if(/^\d+$/.test(position)&&/^\d+\.\d+$/.test(quantity)&&price&&amount){
      const raw=cell(r,.21,.275);
      const code=/^SERV[O0C\d]+$/.test(raw)?"SERV"+raw.slice(4).replace(/[OC]/g,"0"):raw;
      last={position,code,quantity,unit:cell(r,.16,.21),description:cell(r,.275,.74),price,amount,page:r.page, sourceY: r.y};result.materials.push(last);
    }else if(last){const more=cell(r,.275,.74);if(more)last.description+=" "+more;}
  }
}

