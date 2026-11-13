import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
const root=process.argv[2];
if(!root)throw new Error('Indica la carpeta de los PDF Agro Alimentos Puebla.');
const expected=[
 ['7519','23/05/2026','9,900.00','1,584.00','11,484.00',[['M2009','2.00','4,950.00','9,900.00','Celda de carga Celda de Carga modelo NA3 MAVIN']]],
 ['7698','19/06/2026','39,450.00','6,312.00','45,762.00',[
 ['SR035','1.00','22,500.00','22,500.00','MANTENIMIENTO MAQUINARIA Y EQUIPO modulo Allen-Bradley, modelo SLC500, cat. 1746-0A16-D.'],
 ['SR035','1.00','16,950.00','16,950.00','MANTENIMIENTO MAQUINARIA Y EQUIPO SERVICIO DE INSTALACION']]],
 ['6850','02/03/2026','158,690.00','25,390.40','184,080.40',[
 ['M2151','2.00','19,850.00','39,700.00','Fuente de Alimentación, Modelo 472-F, marca Thomson Scale'],
 ['MT166','2.00','18,955.00','37,910.00','Tarjeta electrónica CPU 470 THIELE'],
 ['MT164','2.00','18,950.00','37,900.00','Tarjeta electrónica I/O 473 THIELE'],
 ['MT165','2.00','21,590.00','43,180.00','Tarjeta electrónica DIGITIZER 474 THIELE']]],
 ['6532','15/01/2026','79,080.00','12,652.80','91,732.80',[
 ['M1283','6.00','6,590.00','39,540.00','Celda de carga RICE LAKE RL 1218 A 200kg de Aluminio 2mV/V 5-10 VDC'],
 ['M0647','6.00','6,590.00','39,540.00','Celda de carga RICE LEAK, model.- RL1218A, cap.-2.0502 mv/v at 100 kg, sn.-2400798, class lll 5-s']]],
];
for(let i=0;i<expected.length;i++){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,`Agro Alimentos Puebla_${i+1}.pdf`))),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
 try{
  const doc=await task.promise,rows=[];
  for(let n=1;n<=doc.numPages;n++){
   const p=await doc.getPage(n),v=p.getViewport({scale:1}),c=await p.getTextContent();
   rows.push(...makeRows(c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width})),n));
  }
  const o=extractOrder('Agro Alimentos Puebla',rows),e=expected[i];
  assert.deepEqual([o.id,o.date,o.subtotal,o.tax,o.total],e.slice(0,5));
  assert.deepEqual(o.materials.map(m=>[m.code,m.quantity,m.price,m.amount,m.description]),e[5]);
  assert.deepEqual(o.materials.map(m=>m.position),e[5].map((_,j)=>String(j+1).padStart(2,'0')));
  assert.ok(o.materials.every(m=>m.unit===(i===1?'SERVICIO':'PZA')));
  assert.ok(!o.warnings.some(w=>/partidas|no coincide/.test(w)));
  const forced=extractOrder('Agro Alimentos Puebla',rows,{usedOcr:true});
  assert.equal(forced.subtotal,e[2]);assert.equal(forced.subtotalSource,'calculated');
  console.log('PASS Agro Alimentos Puebla_'+(i+1));
 }finally{await task.destroy();}
}
