import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {companies, makeRows, extractOrder} from '../lib/extract-order.ts';
import {pilgrimsCompanies} from '../lib/pilgrims.ts';
import {binarize, removeTableLines, recognizeRows, ocrScale} from '../lib/ocr.ts';

const root=process.argv[2];
if(!root)throw new Error('Indica la carpeta de las cuatro muestras Pilgrims.');
const expected=[
 ['4516232187','26/01/2026','21,300.00','3,408.000000','24,708.000000','000000000801022244','2.00','10,650.000000','21,300.000000',2,/CABEZAL[\s\S]*FACTURA ORIGINAL/],
 ['4516243477','26/02/2026','84,590.000000','13,534.400000','98,124.400000','000000000700107569','1.00','84,590.000000','84,590.000000',1,/VITAM-917DR[\s\S]*SOLICITA: ANTONIO HERNANDEZ$/],
 ['4516347714','24/03/2026','40,000.00','6,400.000000','46,400.000000','000000000700107569','1.00','40,000.000000','40,000.000000',2,/IMPRESORA DE[\s\S]*HERNANDEZ$/],
 ['4516378355','08/04/2026','9,450.000000','1,512.000000','10,962.000000','000000000801462217','3.00','3,150.000000','9,450.000000',1,/^DISCO DURO KINGSTON SATA A400 960GB - DISCO DURO KINGSTON SATA A400 960GB -$/],
];
assert.ok(!companies.includes('Pilgrims'));
assert.ok(pilgrimsCompanies.every(company=>companies.includes(company)));
let worker;
try {
 for(const [index,e] of expected.entries()) {
  const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,`pilgrims_v${index+1}.pdf`))),wasmUrl:path.resolve('node_modules/pdfjs-dist/wasm').replaceAll('\\','/')+'/',standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
  try {
   const doc=await task.promise,rows=[];
   let usedOcr=false;
   for(let n=1;n<=doc.numPages;n++) {
    const page=await doc.getPage(n),v=page.getViewport({scale:1}),content=await page.getTextContent();
    const words=content.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width}));
    if(words.some(w=>w.text.trim())) rows.push(...makeRows(words,n));
    else {
     usedOcr=true;
     if(!worker)worker=await createWorker('spa',1,{langPath:'node_modules/@tesseract.js-data/spa/4.0.0',cacheMethod:'none'});
     const scale=ocrScale('Pilgrims',v.width,v.height),view=page.getViewport({scale});
     const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height)),ctx=canvas.getContext('2d');
     await page.render({canvas,canvasContext:ctx,viewport:view}).promise;
     const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
     binarize(pixels.data);removeTableLines(pixels.data,canvas.width,canvas.height);ctx.putImageData(pixels,0,0);
     rows.push(...await recognizeRows(worker,canvas.toBuffer('image/png'),canvas.width,canvas.height,scale,n,'Pilgrims'));
    }
    page.cleanup();
   }
   const order=extractOrder('Pilgrims',rows,{usedOcr});
   for(const company of pilgrimsCompanies)assert.deepEqual(extractOrder(company,rows,{usedOcr}),order,company);
   assert.deepEqual([order.id,order.date,order.subtotal,order.tax,order.total],e.slice(0,5));
   assert.equal(order.currency,'MXN');assert.equal(order.materials.length,1);
   const m=order.materials[0];
   assert.deepEqual([m.code,m.quantity,m.price,m.amount,m.page],e.slice(5,10));
   assert.equal(m.position,'10');assert.equal(m.unit,'EA');assert.match(m.description,e[10]);
   assert.doesNotMatch(m.description,/Solicitud:|Solicitante:|CONDICIONES|Subtotal|https:|Mercado/);
   assert.equal(order.subtotalSource,usedOcr?'calculated':undefined);
   assert.ok(!order.warnings.some(w=>/no coincide|no encontrado|incomplet/.test(w)),order.warnings.join('\n'));
   assert.equal(extractOrder('Comex',rows).materials.length,0);
   const noTax=rows.filter(r=>!/^Iva\s*\(/i.test(r.text));
   const missing=extractOrder('Pilgrims',noTax,{usedOcr:true});
   assert.equal(missing.tax,'');assert.equal(missing.subtotalSource,undefined);
   assert.ok(missing.warnings.some(w=>w.startsWith('IVA:')));
   console.log(`PASS pilgrims_v${index+1}: ${order.id}, ${usedOcr?'OCR':'texto'}, partidas y totales`);
  } finally {await task.destroy();}
 }
} finally {await worker?.terminate();}
assert.equal(extractOrder('Pilgrims',[]).materials.length,0);
