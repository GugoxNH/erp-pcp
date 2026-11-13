import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
const root=process.argv[2];if(!root)throw Error('Indica la carpeta pq con las tres muestras.');
const samples=[
 ['A 62117','22-sep-2026','2.00','REMA1003','12,650.00','25,300.00','4,048.00','29,348.00','Cabezal de impresión P/impresor Toshiba B-SA4T 300DPI / NP 7FD00973100'],
 ['A 61283','13-mar-2026','2.00','REMA1003','12,650.00','25,300.00','4,048.00','29,348.00','Cabezal de impresión P/impresor Toshiba B-SA4T 300DPI / NP: 7FM00973100'],
 ['A 62398','14-jul-2026','3.00','REMA3769','5,445.00','16,335.00','2,613.60','18,948.60','Teclado para indicador de peso ZM615 /'],
];
for(const [i,v] of samples.entries()){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,`PolloQro_${i+1}.pdf`)))});
 try{const doc=await task.promise;const rows=[];for(let n=1;n<=doc.numPages;n++){
 const p=await doc.getPage(n),vp=p.getViewport({scale:1}),text=await p.getTextContent();rows.push(...makeRows(text.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/vp.width,y:i.transform[5],width:i.width/vp.width})),n));}
 const r=extractOrder('PolloQro',rows);assert.deepEqual([r.id,r.date,r.currency,r.subtotal,r.tax,r.total],[v[0],v[1],'MXN',v[5],v[6],v[7]]);
 assert.equal(r.materials.length,1);assert.deepEqual(r.materials[0],{position:'1',code:v[3],description:v[8],quantity:v[2],unit:'PZA',price:v[4],amount:v[5],page:1});
 assert.equal(r.subtotalSource,'calculated');assert.ok(!r.warnings.some(w=>/no coincide|no encontrado|CANT\./.test(w)));console.log('PASS',r.id);
 }finally{await task.destroy();}
}
