import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder,companies} from '../lib/extract-order.ts';
const root=process.argv[2];
if(!root)throw new Error('Indica la carpeta de los tres PDF PPG.');
const expected=[
 ['326367','21-JAN-2026','33,950.00',[['1','25200042.EA.3557','1','33,950','33,950.00','SWITCH DE PRESION, MARCA ASCO, MODELO SA12D/TJ10A44-B']]],
 ['328264','26-FEB-2026','11,800.00',[['1','','1','4,850','4,850.00','CABLE V1-W-E2-10MPUR 10 m Solicita: Abraham Gonzalez Area: MOFA #26221'],['2','','1','6,950','6,950.00','CABLE V1-W-E2-10MPUR 20 m Solicita: Abraham Gonzalez Area: MOFA #26221']]],
 ['335469','20-AUG-2026','135,800.00',[['1','','4','33,950','135,800.00','ACT 26-02 ACT0068195 SLA-S-Y: Static Grounding Monitoring System #26581']]],
];
assert.ok(companies.includes('PPG'));
for(let i=0;i<3;i++){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,`PPG_${i+1}.pdf`)))});
 try{
  const doc=await task.promise,rows=[];
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),v=page.getViewport({scale:1}),c=await page.getTextContent();
   rows.push(...makeRows(c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width})),n));
  }
  const o=extractOrder('PPG',rows),e=expected[i];
  assert.deepEqual([o.id,o.date,o.total],e.slice(0,3));
  assert.equal(o.currency,'MXN');assert.equal(o.subtotal,'');assert.equal(o.tax,'');
  assert.equal(o.subtotalSource,undefined);
  assert.deepEqual(o.materials.map(m=>[m.position,m.code,m.quantity,m.price,m.amount,m.description]),e[3]);
  assert.ok(o.materials.every(m=>m.unit==='EACH'));
  assert.equal(extractOrder('Comex',rows).materials.length,0);
  assert.equal(extractOrder('PPG',rows,{usedOcr:true}).subtotal,'');
  console.log(`PASS PPG_${i+1}`);
 }finally{await task.destroy();}
}
