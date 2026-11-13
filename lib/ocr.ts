import type { Page, Worker, ImageLike } from "tesseract.js";
import { makeRows } from "./extract-order.ts";
import { isPilgrims } from "./pilgrims.ts";

export function ocrRows(data: Page, width: number, height: number, scale: number, page: number) {
  const words=(data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words.map(w=>({
    text:w.text,x:w.bbox.x0/width,width:(w.bbox.x1-w.bbox.x0)/width,y:(height-l.bbox.y1)/scale,
  })))));
  return makeRows(words,page);
}

// Suppress yellow highlights and paper noise, retaining the printed text.
export function binarize(pixels: Uint8ClampedArray) {
  for(let i=0;i<pixels.length;i+=4){const value=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2]>165?255:0;pixels[i]=pixels[i+1]=pixels[i+2]=value;}
}

// Pilgrims table borders hide small quantities and totals from page segmentation.
export function removeTableLines(pixels: Uint8ClampedArray, width: number, height: number) {
  const lines: number[][] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && pixels[(y * width + x) * 4] === 0) { if (start < 0) start = x; }
      else if (start >= 0) { if (x - start > width * .2) lines.push([start, y, x, y + 1]); start = -1; }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      if (y < height && pixels[(y * width + x) * 4] === 0) { if (start < 0) start = y; }
      else if (start >= 0) { if (y - start > height * .04) lines.push([x, start, x + 1, y]); start = -1; }
    }
  }
  for (const [x0, y0, x1, y1] of lines) {
    for (let y = Math.max(0, y0 - 1); y < Math.min(height, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x < Math.min(width, x1 + 1); x++) {
        const i = (y * width + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      }
    }
  }
}

export function ocrScale(company: string, width: number, height: number) {
  const scale=["Agrogen","Grupo Abrego","Empacadora","Nutribaq"].includes(company)?4:3;
  return Math.min(scale,4200/Math.max(width,height));
}

export async function recognizeRows(worker: Worker, image: ImageLike, width: number, height: number, scale: number, page: number, company: string, originalImage: ImageLike = image) {
  if(isPilgrims(company))await worker.setParameters({tessedit_pageseg_mode:"3" as import("tesseract.js").PSM});
  const {data}=await worker.recognize(image,{},{blocks:true});
  const rows=ocrRows(data,width,height,scale,page);
  if(company==="Nutribaq") {
    await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
    try {
      for(const row of rows) {
        const item=/^\d+\s+\d+[.,]\d+\s/.test(row.text);
        const total=/^TOTAL\s/.test(row.text)&&!/^TOTAL DE/.test(row.text);
        if(!item&&!total)continue;
        for(const [a,b] of item?[[.21,.275],[.82,.884],[.925,.987]]:[[.924,.987]]){
          const top=Math.max(0,Math.floor(height-row.y*scale-13*scale));
          const rectangle={left:Math.floor(width*a),top,width:Math.floor(width*(b-a)),height:Math.ceil(17*scale)};
          const {data:d}=await worker.recognize(originalImage,{rectangle});
          let value=d.text.trim();
          if(total){
            const sum=rows.find(r=>/SUMA/.test(r.text))?.text.match(/SUMA\s*\$?\s*([\d,]+\.\d{2})/)?.[1];
            const tax=rows.find(r=>/^[IL1]\.?V\.?A/.test(r.text))?.text.match(/([\d,]+\.\d{2})/)?.[1];
            await worker.setParameters({tessedit_pageseg_mode:"8" as import("tesseract.js").PSM});
            const retry=await worker.recognize(originalImage,{rectangle});
            await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
            const candidates=[value,retry.data.text].map(s=>s.match(/[\d,]+\.\d{2}\b/)?.[0]).filter((s):s is string=>Boolean(s));
            if(sum&&tax){const n=(s:string)=>Number(s.replaceAll(",",""));value=candidates.find(s=>Math.abs(n(s)-n(sum)-n(tax))<.02)||value;}
          }
          if(a<.3){value=value.replace(/\s/g,"");if(!/^SERV[O0C\d]+$/.test(value))continue;value="SERV"+value.slice(4).replace(/[OC]/g,"0");}
          else {value=value.match(/[\d,]+\.\d{2}\b/)?.[0]||"";if(!value)continue;}
          row.words=row.words.filter(w=>w.x<a||w.x>=b);row.words.push({text:value,x:a+.001,width:b-a,y:row.y});row.words.sort((a,b)=>a.x-b.x);row.text=row.words.map(w=>w.text).join(" ");
        }
      }
    }finally{await worker.setParameters({tessedit_pageseg_mode:"3" as import("tesseract.js").PSM});}
    return rows;
  }
  if(company!=="Grupo Abrego"&&company!=="Empacadora")return rows;
  // Small highlighted fields benefit from a separate single-line recognition pass.
  await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
  try {
    if(company==="Empacadora"&&page===1){
      const {data:header}=await worker.recognize(image,{rectangle:{left:Math.floor(width*.373),top:Math.floor(height*.085),width:Math.floor(width*.06),height:Math.floor(height*.03)}});
      const id=header.text.trim();
      if(/^\d{5,}$/.test(id))rows.unshift({text:`Numero de Orden ${id}`,words:[],y:height/scale,page});
    }
    if(company==="Grupo Abrego"){
      const totals: {label:string;row:typeof rows[number];values:string[]}[]=[];
      const read=async(left:number,right:number,top:number,bottom:number,numeric=false)=>{
      await worker.setParameters({tessedit_char_whitelist:""});
        const rectangle={left:Math.floor(left*width),top:Math.max(0,Math.floor(top)),width:Math.floor((right-left)*width),height:Math.min(Math.ceil(bottom-top),height-Math.max(0,Math.floor(top)))};
        const {data:d}=await worker.recognize(originalImage,{rectangle});
        if(!numeric)return d.text.trim();
        let value=d.text.match(/\b[\d,]+\.\d{2}\b/)?.[0]||"";
        if(!value){
          await worker.setParameters({tessedit_pageseg_mode:"8" as import("tesseract.js").PSM});
          const retry=await worker.recognize(originalImage,{rectangle});
          value=retry.data.text.match(/\b[\d,]+\.\d{2}\b/)?.[0]||"";
          await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
        }
        return value;
      };
      if(page===1){const id=await read(.80,.955,height*.055,height*.089);const m=id.match(/B\s*([\d ]+)/i);if(m)rows.unshift({text:"OC_ABREGO B "+m[1].replace(/\s/g,""),words:[],y:height/scale,page});}
      for(const row of rows){
        const top=height-row.y*scale-12*scale,bottom=height-row.y*scale+3*scale;
        const replace=async(a:number,b:number)=>{
          const candidates=(data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).filter(w=>w.bbox.x0/width>=a&&w.bbox.x0/width<b&&Math.abs(w.bbox.y1-(height-row.y*scale))<16*scale);
          const anchor=a<.15?candidates.sort((a,b)=>Math.abs(a.bbox.y1-(height-row.y*scale))-Math.abs(b.bbox.y1-(height-row.y*scale)))[0]:undefined;
          const value=await read(a,b,anchor?anchor.bbox.y0-3*scale:top,anchor?anchor.bbox.y1+3*scale:bottom,true);
          if(!/^[\d,]+\.\d{2}$/.test(value))return;
          row.words=row.words.filter(w=>w.x<a||w.x>=b);row.words.push({text:value,x:a+.001,width:b-a,y:row.y});row.words.sort((a,b)=>a.x-b.x);row.text=row.words.map(w=>w.text).join(" ");
        };
        if(/^\d+\s/.test(row.text)&&row.words.some(w=>w.x>.8)&&row.words.some(w=>w.x<.07)){
          await replace(.105,.145);await replace(.80,.865);await replace(.89,.962);
          await worker.setParameters({tessedit_pageseg_mode:"8" as import("tesseract.js").PSM});
          const recognizedCode=(await read(.18,.25,top,bottom)).match(/\b[A-Z]{4}[0-9O]{4,5}\b/)?.[0]||"";
          // These article codes have a four-letter prefix and a numeric suffix.
          const code=/^[A-Z]{4}[0-9O]{4,5}$/.test(recognizedCode)?recognizedCode.slice(0,4)+recognizedCode.slice(4).replaceAll("O","0"):recognizedCode;
          await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
          if(/^[A-Z]+\d+$/.test(code)){row.words=row.words.filter(w=>w.x<.18||w.x>=.25);row.words.push({text:code,x:.181,width:.069,y:row.y});row.words.sort((a,b)=>a.x-b.x);row.text=row.words.map(w=>w.text).join(" ");}
        }
        const label=row.words.filter(w=>w.x>.69&&w.x<.78).map(w=>w.text).join("");
        if(/^(?:SUMA|[IL1]\.?V\.?A\.?|TOTAL)$/.test(label)){
          const values:string[]=[];
          for(const mode of ["7","8"]){
            await worker.setParameters({tessedit_pageseg_mode:mode as import("tesseract.js").PSM});
            const value=await read(.842,.907,top,bottom,true);if(value&&!values.includes(value))values.push(value);
          }
          await worker.setParameters({tessedit_pageseg_mode:"7" as import("tesseract.js").PSM});
          const normalized=label==="SUMA"?"SUMA":label==="TOTAL"?"TOTAL":"IVA";
          totals.push({label:normalized,row,values});
          if(values[0])row.text=normalized+" "+values[0]+" M.N.";
        }
      }
        // Choose between OCR readings only when the printed amounts agree arithmetically.
      // No amount is synthesized here: the subtotal calculation remains a separate step.
      const sum=totals.find(t=>t.label==="SUMA"),tax=totals.find(t=>t.label==="IVA"),total=totals.find(t=>t.label==="TOTAL");
      if(sum&&tax&&total){
        const number=(s:string)=>Number(s.replaceAll(",",""));
        const combinations=sum.values.flatMap(s=>tax.values.flatMap(i=>total.values.map(t=>({s,i,t}))));
        const match=combinations.find(v=>Math.abs(number(v.s)+number(v.i)-number(v.t))<.025);
        if(match){sum.row.text="SUMA "+match.s+" M.N.";tax.row.text="IVA "+match.i+" M.N.";total.row.text="TOTAL "+match.t+" M.N.";}
      }
      await worker.setParameters({tessedit_char_whitelist:""});
    }
  }finally{await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"3" as import("tesseract.js").PSM});}
  return rows;
}

