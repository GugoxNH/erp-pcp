import type { Row, Order, Material } from "./extract-order";

export function extractAdditional(company: string, rows: Row[], result: Order) {
  if(!["Cargill","Calquimica","Daltile","Agrogen","Ceypabasa"].includes(company))return;
  const text=rows.map(r=>r.text).join("\n");
  const capture=(re:RegExp)=>text.match(re)?.[1]?.trim()||"";
  const money="([\\d][\\d.,]*[.,]\\d{2,4})";
  const amount=(label:string)=>capture(new RegExp(label+"\\s*[:$]?\\s*\\$?\\s*"+money,"im"));
  const cell=(r:Row,a:number,b:number)=>r.words.filter(w=>w.x>=a&&w.x<b).map(w=>w.text).join(" ").trim();
  if(company==="Cargill") {
    result.id=capture(/Orden de Compra\s+(\d+)/i);
    result.subtotal=amount("Subtotal");result.tax=amount("\\bIVA");result.total=amount("^Total");
    if(/Impuestos no incluidos/i.test(text))result.warnings.push("Cargill indica impuestos no incluidos. No se calcula IVA ni se usa el subtotal como total.");
  } else if(company==="Calquimica") {
    result.id=capture(/Orden de compra\s+(CQM-OC-[\w-]+)/i);
    const header=rows.findIndex(r=>/DIVISA/.test(r.text));
    const values=rows.slice(header+1,header+7).find(r=>/\d{2}\/\d{2}\/\d{4}/.test(r.text));
    result.date=values?.text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]||"";
    result.currency=values?.text.match(/\b(MXN|USD|EUR)\b/)?.[1]||"";
  } else if(company==="Daltile") {
    result.id=capture(/NUM ORDEN:\s*(\d+)/i);result.date=capture(/FECHA OC:\s*([\dA-Z-]+)/i);result.subtotal=amount("SUB TOTAL:");result.total=amount("^TOTAL:");
  } else if(company==="Agrogen") {
    result.id=capture(/Número de documento\s+(\d+)/i);result.date=capture(/Fecha de documento\s+([\d.]+)/i);
    result.currency=capture(/\b(MXN|USD|EUR)\//)||capture(/\b(MXN|USD|EUR)\b/);
    result.tax=amount("IVA Repercutido");result.total=amount("\\bTotal");
  } else {
    result.id=capture(/\b(OC-\d+-\d+)\b/i);
    result.date=capture(/Fecha[^\d\n]*(\d{2}\/\d{2}\/\d{4})/i);
    result.currency=capture(/\b(MXN|USD|EUR)\b/);
    const index=rows.findIndex(r=>/Saldo de ventas/i.test(r.text));
    const amounts=rows[index+1]?.text.match(/[\d][\d,]*\.\d{2}/g);
    if(index>=0&&amounts&&amounts.length>=6){result.subtotal=amounts[0];result.tax=amounts[3];result.total=amounts[5];}
    result.warnings.push("El campo IVA corresponde a «Impuestos de venta» en esta plantilla; revisa el importe en el original.");
  }
  let active=false;let last:Material|undefined;let previousPage=0;
  for(const r of rows){
    if(r.page!==previousPage){active=false;last=undefined;previousPage=r.page;}
    if(/Artí Código|PARTIDA CÓDIGO|LIN ARTICULO|Partida Material|Código de artículo/i.test(r.text)){active=true;continue;}
    if(/Subtotal|SUB TOTAL|OBSERVACIONES Y CONDICIONES|Saldo de ventas|The item covers|Calendario de Entregas/i.test(r.text)){active=false;last=undefined;continue;}
    if(!active)continue;
    const base:Material={position:"",code:"",description:"",quantity:"",unit:"",price:"",amount:"",page:r.page, sourceY: r.y};
    let m:RegExpMatchArray|null;let item:Material|undefined;
    if(company==="Cargill") {
      m=r.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"(?:\\s+.*)?$"));
      if(m)item={...base,position:m[1].length<6?m[1]:"",code:m[1].length>=6?m[1]:"",description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6],detail:m[1].length>=6};
      else if(last){const more=cell(r,.17,.30);if(more&&!/Material|Unitario/.test(more))last.description+=" "+more;}
    } else if(company==="Calquimica") {
      m=r.text.match(new RegExp("^\\*?(\\d+)\\s+(\\S+)\\s+(.+?)\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"$"));
      if(m)item={...base,position:m[1],code:m[2],description:m[3],quantity:m[4],unit:m[5],price:m[6],amount:m[7]};
      else if(last){last.code+=cell(r,.11,.25);const more=cell(r,.25,.53);if(more)last.description+=" "+more;}
    } else if(company==="Daltile") {
      m=r.text.match(new RegExp("^(\\d+)\\s+\\d{2}-[A-Z]+-\\d{2}\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s+([\\d.,]+)\\s+\\$?"+money+"$","i"));
      if(m)item={...base,position:m[1],unit:m[2],quantity:m[3],price:m[4],amount:m[5]};
      else if(last){const more=cell(r,.06,.60);if(more)last.description+=" "+more;}
    } else if(company==="Agrogen") {
      m=r.text.match(new RegExp("^(\\d+)\\s+(.+?)\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"(?:\\s+(?:MXN|USD|EUR))?$"));
      if(m)item={...base,position:m[1],description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6]};
      else if(last){
        // Only the short description column continues; numbered service notes are excluded.
        if(/ALCANCE|ESPECIFICACIONES|^\d+-/.test(r.text)){active=false;continue;}
        const more=cell(r,.17,.48);if(more)last.description+=" "+more;
      }
    } else {
      m=r.text.match(new RegExp("^(\\S+)\\s+(.+?)\\s+\\d{2}/\\d{2}/\\d{4}\\s+(\\d+\\.\\d+)\\s+(\\S+)\\s+"+money+"\\s+"+money+"$"));
      if(m)item={...base,code:m[1],position:String(result.materials.length+1),description:m[2],quantity:m[3],unit:m[4],price:m[5],amount:m[6]};
    }
    if(item){result.materials.push(item);last=item;}
  }
}
