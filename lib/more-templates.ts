import type { Row, Order, Material } from "./extract-order";
import Decimal from "decimal.js";

export const moreSignatures:Record<string,RegExp>={
  "Grupo Abrego":/ABREGO CH[AÁ]VEZ|AECL600524LA3/i,
  PolloQro:/POLLO DE QUER[EÉ]TARO|PQU-010316-V43/i,
  Ingredion:/Ingredion M[eé]xico/i,
  Empacadora:/EMPACADORA.*CELAYA/i,
  "Taylor farms":/TAYLOR FARMS DE MEXICO/i,
};

export function extractMore(company:string,rows:Row[],result:Order){
  if(!moreSignatures[company])return;
  const text=rows.map(r=>r.text).join("\n");
  const capture=(re:RegExp)=>text.match(re)?.[1]?.trim()||"";
  const money="([\\d,]+\\.\\d{2,4})";
  const cell=(r:Row,a:number,b:number)=>r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(" ").trim();
  if(company==="Grupo Abrego"||company==="PolloQro"){
    const prefix=company==="PolloQro"?"A":"B";
    result.id=capture(new RegExp("\\b("+prefix+"\\s+\\d[\\d ]*)\\b")) .replace(/\s+/g,"");
    if(company==="Grupo Abrego"){const id=capture(/OC_ABREGO B ([\d]+)/)||capture(/\bB[ \t]+([\d ]+)/);result.id=id?"B "+id.replace(/\s/g,""):"";}
    if(company==="PolloQro")result.id=capture(/\b(A[ \t]+\d+)\b/).replace(/[ \t]+/g," ");
    result.date=capture(/Fecha\s*(?:Expedici[oó]n|:)\s*(\d{1,2}-[a-z]+-\d{4})/i);
    if(result.date&&Number(result.date.split("-")[0])>31){result.date="";result.warnings.push("La fecha reconocida no es válida. Revisa la fecha de expedición en el PDF.");}
    result.currency=/\bM\.?N\b/.test(text)?"MXN":"";
    result.subtotal=capture(/\bSUMA\s*\$?\s*([\d,]+\.\d{2})/i);
    result.tax=capture(/^I\.?V\.?A\.?\s*[$5]?\s*([\d,]+\.\d{2})/im);
    result.total=capture(/^TOTAL\s*\$?\s*([\d,]+\.\d{2})/im);

  }else if(company==="Ingredion"){
    result.id=capture(/^No\.\s*(\d+)/im);
    const header=rows.findIndex(r=>/FECHA ORDEN DE COMPRA/.test(r.text));
    result.date=rows.slice(header+1,header+5).map(r=>r.text).join(" ").match(/\d{2}\.\d{2}\.\d{4}/)?.[0]||"";
    result.currency=capture(/\b(MXN|USD|EUR)\b/);
    const totals=text.match(/^TOTAL\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*\$?\s*([\d,]+\.\d{2})/im);
    if(totals)[result.subtotal,result.tax,result.total]=totals.slice(1);
  }else if(company==="Empacadora"){
    result.id=capture(/Numero de Orden\s+(\d{5,})/i)||capture(/(\d{5,})\s+CR\b/i);
    result.date=capture(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    result.currency=capture(/(?:Codigo de Moneda|Moneda)\s+(MXP|MXN|USD|EUR)/i);
  }else{
    result.id=capture(/Number\s+(PO-[\d-]+)/i);
    result.date=capture(/^Date\s+(\d{1,2}\/\d{1,2}\/\d{4})/im);
    const totals=text.match(/\b(MXN|USD|EUR)\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/);
    if(totals)[result.currency,result.subtotal,result.tax,result.total]=totals.slice(1);
    result.warnings.push("Las fechas numéricas de Taylor farms están expresadas en mes/día/año; el formulario las muestra en dd/mm/aaaa.");
  }
  let active=false,last:Material|undefined,previousPage=0;
  for(const row of rows){
    if(row.page!==previousPage){active=company==="Empacadora";last=undefined;previousPage=row.page;}
    if(/DESCRIPCI[ÓO]N Y PRESENTACI[ÓO]N|LINE QUANTITY|number number Description/.test(row.text)){active=true;continue;}
    if(/SUMA|Subtotal|SUB-TOTAL|TOTAL DE PARTIDAS|StorageBin:|\*De acuerdo|Condiciones de la orden|^Sales$|^Currency/.test(row.text)){active=false;last=undefined;continue;}
    if(!active)continue;
    const base:Material={position:"",code:"",description:"",quantity:"",unit:"",price:"",amount:"",page:row.page, sourceY: row.y};
    let item:Material|undefined,m:RegExpMatchArray|null;
    if(company==="PolloQro"){
      const position=cell(row,0,.07),quantity=cell(row,.07,.135);
      const unit=cell(row,.135,.17),code=cell(row,.17,.235);
      const price=cell(row,.77,.885).replace(/\$/g,"").trim();
      const amount=cell(row,.885,1).replace(/\$/g,"").trim();
      // Read by column so a blank or alphanumeric cost center cannot shift the amounts.
      if(/^\d+$/.test(position)&&/^[\d,]+\.\d+$/.test(quantity)&&code&&/^[\d,]+\.\d+$/.test(price)&&/^[\d,]+\.\d+$/.test(amount)){
        item={...base,position,quantity,unit,code,price,amount,description:cell(row,.235,.69)};
      }else if(last){const more=cell(row,.235,.69);if(more)last.description+=" "+more;}
    }else if(company==="Grupo Abrego"){
      const position=cell(row,0,.08),quantity=cell(row,.10,.145),unit=cell(row,.145,.18),code=cell(row,.18,.25);
      const price=cell(row,.80,.865).replace(/[$ ]/g,""),amount=cell(row,.89,.97).replace(/[$ ]/g,"");
      if(/^\d+$/.test(position)&&quantity&&code&&/^[\d,]+\.\d{2}$/.test(price)&&/^[\d,]+\.\d{2}$/.test(amount))item={...base,position,quantity,unit,code,price,amount,description:cell(row,.25,.77)};
      else if(last){const more=cell(row,.25,.77);if(more)last.description+=" "+more;}
    }else if(company==="Ingredion"){
      m=row.text.match(new RegExp("^(\\d+)\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+\\d{2}\\.\\d{2}\\.\\d{4}\\s+(\\S+)\\s+(?:MXN|USD|EUR)\\s+"+money+"\\s+(?:MXN|USD|EUR)\\s+"+money+"$"));
      if(m)item={...base,position:m[1],quantity:m[2],unit:m[3],code:m[4],price:m[5],amount:m[6]};
      else if(last&&!/^Req:/.test(row.text)){const more=cell(row,.25,.59);if(more)last.description+=" "+more;}
    }else if(company==="Empacadora"){
      if(/^\d+\.\d+\s/.test(row.text)&&/\$/.test(row.text)){
        const prices=cell(row,.68,.89).match(/[\d,]+\.\d{2,4}/g);
        if(prices&&prices.length>=2)item={...base,position:cell(row,0,.065),description:cell(row,.065,.37),code:cell(row,.37,.455),quantity:cell(row,.535,.62),unit:cell(row,.645,.68),price:prices[0],amount:prices[1]};
      }else if(last){const more=cell(row,.065,.37);if(more)last.description+=" "+more;}
    }else{
      m=row.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+\\d{1,2}/\\d{1,2}/\\d{4}\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+[\\d.]+\\s+[\\d.]+%\\s+"+money+"$"));
      if(m)item={...base,position:m[1],description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6]};
      else if(last){const more=cell(row,.16,.31);if(more)last.description+=" "+more;}
    }
    if(item){result.materials.push(item);last=item;}
  }
  if(company==="PolloQro"){
    for(const item of result.materials){
      if(![item.quantity,item.price,item.amount].every(value=>/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d+$/.test(value))){
        result.warnings.push(`PolloQro, partida ${item.position}: los valores numéricos no son claros. No se intercambiaron CANT. y UNITARIO; favor de verificar.`);
        continue;
      }
      const quantity=new Decimal(item.quantity.replace(/,/g,""));
      const price=new Decimal(item.price.replace(/,/g,""));
      const amount=new Decimal(item.amount.replace(/,/g,""));
      // This is a heuristic, not proof: swapping factors cannot validate column meaning.
      const suspicious=quantity.gt(100)&&price.gte(1)&&price.lte(10)&&price.isInteger()&&quantity.gte(price.mul(100));
      if(suspicious&&quantity.mul(price).minus(amount).abs().lte("0.02")){
        const originalQuantity=item.quantity,originalPrice=item.price;
        item.quantity=originalPrice;item.price=originalQuantity;
        result.warnings.push(`PolloQro, partida ${item.position} (página ${item.page}): se intercambiaron CANT. y UNITARIO por posible inversión de columnas. Cantidad: ${originalQuantity} → ${item.quantity}; precio unitario: ${originalPrice} → ${item.price}. El importe se conserva; favor de verificar en el documento.`);
      }else if(suspicious||item.unit==="$"){
        result.warnings.push(`PolloQro, partida ${item.position} (página ${item.page}): posible inversión de CANT. y UNITARIO, sin evidencia suficiente para corregirla automáticamente. Se conservan los valores impresos; favor de verificar.`);
      }
    }
  }
  for(const item of result.materials)item.description=item.description.trim();
}
