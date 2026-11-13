import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
import {recognizeRows,binarize,ocrScale} from '../lib/ocr.ts';
import assert from 'node:assert/strict';
const expected=[['B 8418','24-dic-2025',70650,11304,81954,[['REVE0165',3,23550,70650]]],['B 8422','24-dic-2025',65100,10416,75516,[['MAEL0476',3,13450,40350],['MAEL10024',3,8250,24750]]],['B 11946','04-jun-2026',59820,9571.20,69391.20,[['REMA0035',4,14955,59820]]],['B 13940','29-ago-2026',41500,6640,48140,[['REMA0307',1,32950,32950],['REMA1247',1,8550,8550]]],['B 13002','17-jul-2026',10494,1679.04,12173.04,[['REMA2369',1,10494,10494]]]];
const root=process.argv[2];if(!root)throw Error('Indica la carpeta pq con las cinco muestras.');let worker;
try{
for(const name of ['GrupoAbrego_1','GrupoAbrego_2','GrupoAbrego_3','GrupoAbrego_4','GrupoAbrego_5']){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,name+'.pdf'))),wasmUrl:path.resolve('node_modules/pdfjs-dist/wasm').replaceAll('\\','/')+'/',standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
 try{const doc=await task.promise;const rows=[];
 for(let n=1;n<=doc.numPages;n++){
 const p=await doc.getPage(n);const v=p.getViewport({scale:1});const c=await p.getTextContent();const words=c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width}));
 if(words.some(w=>w.text.trim()))rows.push(...makeRows(words,n));
 else{
 if(!worker)worker=await createWorker('spa',1,{langPath:'node_modules/@tesseract.js-data/spa/4.0.0',cacheMethod:'none'});
 const scale=ocrScale("Grupo Abrego",v.width,v.height);const view=p.getViewport({scale});const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));const ctx=canvas.getContext('2d');await p.render({canvas,canvasContext:ctx,viewport:view}).promise;
 const originalImage=canvas.toBuffer("image/png");const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);binarize(pixels.data);ctx.putImageData(pixels,0,0);
 rows.push(...await recognizeRows(worker,canvas.toBuffer('image/png'),canvas.width,canvas.height,scale,n,"Grupo Abrego",originalImage));
 }
 }
 const order=extractOrder("Grupo Abrego",rows,{usedOcr:true});const v=expected[Number(name.split('_')[1])-1];
 const num=s=>Number(s.replaceAll(',',''));
 assert.deepEqual([order.id,order.date,num(order.subtotal),num(order.tax),num(order.total) ],v.slice(0,5));
 assert.equal(order.currency,'MXN');assert.equal(order.subtotalSource,'calculated');
 assert.deepEqual(order.materials.map(m=>[m.code,num(m.quantity),num(m.price),num(m.amount)]),v[5]);
 assert.ok(order.materials.every(m=>m.description.trim()&&m.unit==='PZA'));assert.ok(!order.warnings.some(w=>/no coincide|no encontrado/.test(w)));
 if(name==='GrupoAbrego_4')assert.match(order.materials[1].description,/206696/);
 console.log('PASS',order.id);

 }finally{await task.destroy();}
}
}finally{await worker?.terminate();}
