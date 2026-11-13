import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
const root=process.argv[2];
if(!root)throw new Error('Indica la carpeta de los tres PDF Dgari.');
const expected={
 Dgari:['9200118395','17.06.2026','19,600.00',[
  ['0010','','1','10,650.00','10,650.00','Tarjeta principal para indicador 682 26616 - Tarjeta principal para indicador de peso modelo 682'],
  ['0020','','1','8,950.00','8,950.00','Servicio Correctivo a bascula 26616 - Servicio Correctivo a bascula']]],
 Dgari_2:['4502939447','30.09.2025','16,900.00',[
  ['0010','8-89-009232','2','8,450.00','16,900.00','Tarjeta de salidas analogicas modelo 480']]],
 Dgari_3:['9200100959','19.01.2026','13,300.00',[
  ['0010','','2','6,650.00','13,300.00','Fuente de Alimentacion para indicador de COTIZACION: 26066##Fuente de Alimentacion para indicador de peso #modelo 920i version panel mount']]],
};
for(const [name,e] of Object.entries(expected)){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,name+'.pdf'))),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
 try{
  const doc=await task.promise,rows=[];
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),v=page.getViewport({scale:1}),c=await page.getTextContent();
   rows.push(...makeRows(c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width})),n));
  }
  const o=extractOrder('Dgari',rows);
  assert.deepEqual([o.id,o.date,o.subtotal],e.slice(0,3));
  assert.equal(o.currency,'MXN');assert.equal(o.tax,'');assert.equal(o.total,'');
  assert.deepEqual(o.materials.map(m=>[m.position,m.code,m.quantity,m.price,m.amount,m.description]),e[3]);
  assert.ok(o.materials.every(m=>m.unit==='PZA'&&m.page===1));
  assert.ok(!o.warnings.some(w=>/partidas|no coincide/.test(w)));
  assert.equal(extractOrder('Comex',rows).materials.length,0);
  console.log('PASS',name);
 }finally{await task.destroy();}
}
