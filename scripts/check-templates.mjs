import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
import {createCanvas} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {binarize,recognizeRows,ocrScale} from '../lib/ocr.ts';
const root=process.argv[2];
const roots=process.argv.slice(2);
if(!root)throw new Error('Indica la carpeta de las dieciocho plantillas como argumento.');
const expected={
 Bachoco:['4510330183','21.05.2026','MXP','26,640.00','4,262.40','30,902.40',1],
 Campi:['4510315519','14.05.2026','MXP','12,200.00','1,952.00','14,152.00',1],
 Ceat:['260318-001','18/03/2026','USD','5,500.00','880.00','6,380.00',2],
 inovatelia:['000740','26/02/2026','DOLAR AMERICANO','883.22','141.32','1,024.54',1],
 JhonsonMatthey:['2500221210','03.09.2026','USD','309.816,74','0,00','309.816,74',5],
 MartinSproket:['P077774','25/03/2026','MXN','15,046.16','2,407.39','17,453.55',2],
 MEI:['4500970255','05/20/2026','MXN','65,600.00','','65,600.00',1],
 Cargill:['7003479203','12.09.2026','MXN','68,588.01','','',9],
 Calquimica:['CQM-OC-070984-2','29/04/2026','MXN','156,550.00','25,048.00','181,598.00',2],
 Daltile:['720062','18-MAY-26','MXP','64,950.00','10,392.00','75,342.00',1],
 Agrogen:['4500053860','20.01.2026','MXN','12,950.00','2,072.00','15,022.00',1],
 Ceypabasa:['','16/01/2026','MXN','3,245.00','519.20','3,764.20',1],
 'Grupo Abrego':['B 12996','17-jul-2026','MXN','9,850.00','1,576.00','11,426.00',1],
 PolloQro:['A 60532','05-ene-2026','MXN','211,827.00','33,892.32','245,719.32',30],
 Ingredion:['6300073578','12.05.2026','MXN','98,590.00','15,774.40','114,364.40',1],
 Empacadora:['185421','12/06/26','MXP','32,405.00','5,184.80','37,589.80',2],
 'Taylor farms':['PO-00014793-1','8/5/2026','MXN','99,200.00','15,872.00','115,072.00',1],
 OMG:['TECA 023','miércoles, 20 de mayo de 2026','MXN','800.00','128.00','928.00',1],
 Sherwin:['MX001646614','12/29/25','MXN','','','20,400.00',2],
 Ferroservicios:['9078','24/03/2026','','28,950.00','4,632.00','33,582.00',1],
 'Euro Nutec':['58549','30-ABR-2026','MXN','86,950.00','13,912.00','100,862.00',1],
 Comex:['93410','26-FEB-26','MXN','8,950.0000','1,432.0000','10,382.0000',1],
 Dgari:['9200118395','17.06.2026','MXN','19,600.00','','',2],
 'Agro Alimentos Puebla':['6848','02/03/2026','','171,450.00','27,432.00','198,882.00',2],
 NutecGaleras:['151591','11-FEB-2026','MXN','53,900.00','8,624.00','62,524.00',2],
 MInsa:['PC-00493964','12/02/2026','MXP','6,150.00','984.00','7,134.00',1],
 Kerry:['7102839068','2026/03/26','MXN','31,100.00','4,976.00','36,076.00',1],
 Hexpol:['4700186927','01/14/2026','MXP','27,800.00','','',1],
 Capistrano:['359','22/12/25','MXP','180,486.50','28,877.84','209,364.34',3],
 DSA:['PO01309','23/07/2026','MXN','9,650.00','1,544.00','11,194.00',1],
 Audace:['4500147741','09.09.2026','MXN','12,890.00','2,062.40','14,952.40',1],
 'PPG AP Resinas':['70571','05-FEB-26','MXN','29,120.0000','4,659.2000','33,779.2000',2],
 'PPG Comex':['187951','02-JUL-26','MXN','310,382.5050','49,661.2000','360,043.7050',4],
 Nutribaq:['A 03708','18-mar-2026','MXN','26,450.00','4,232.00','30,682.00',1]
};
for(const [company,values] of Object.entries(expected)){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(roots.map(r=>path.join(r,company+'.pdf')).find(p=>fs.existsSync(p)) || path.join(root,company+'.pdf'))),wasmUrl:path.resolve('node_modules/pdfjs-dist/wasm').replaceAll('\\','/')+'/',standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
 try{
 const doc=await task.promise;const rows=[];let usedOcr=false;
 for(let p=1;p<=doc.numPages;p++){
 const page=await doc.getPage(p);const v=page.getViewport({scale:1});const c=await page.getTextContent();
 const words=c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width}));
 if(words.some(w=>w.text.trim()))rows.push(...makeRows(words,p));
 else {
 usedOcr=true;
 const worker=await createWorker('spa',1,{langPath:'node_modules/@tesseract.js-data/spa/4.0.0',cacheMethod:'none'});
 try{const scale=ocrScale(company,v.width,v.height);const view=page.getViewport({scale});const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));const ctx=canvas.getContext('2d');await page.render({canvas,canvasContext:ctx,viewport:view}).promise;
 const originalImage=canvas.toBuffer("image/png");const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);binarize(pixels.data);ctx.putImageData(pixels,0,0);rows.push(...await recognizeRows(worker,canvas.toBuffer('image/png'),canvas.width,canvas.height,scale,p,company,originalImage));
 }finally{await worker.terminate();}
 }
 }
 const order=extractOrder(company,rows,{usedOcr});
 if(usedOcr||company==='PolloQro')assert.equal(order.subtotalSource,'calculated');
 if(company==='Grupo Abrego')assert.equal(order.materials[0]?.quantity,'1.00');
 // Native canvas rasterization differs from Chromium. An uncertain ID must stay missing.
 if(company==='Ceypabasa'){
 assert.ok(order.id===''||order.id==='OC-076457-1');
 if(!order.id)assert.ok(order.warnings.some(w=>w.startsWith('OC:')));
 values[0]=order.id;
 }
 if(company==='Calquimica')assert.equal(order.materials[1].code,'MTO-ELN-014-021-8031');
 if(company==='Sherwin')assert.match(order.materials[1].description,/120 cm largo X 60 cm ancho$/);
 if(company==='Ferroservicios')assert.equal(order.materials[0].description,'MANTENIMIENTO AREA BASCULA');
 if(company==='Euro Nutec')assert.match(order.materials[0].description,/EN COTIZACION 26486$/);
 if(company==='Comex'){assert.match(order.materials[0].description,/Acero Inoxidable$/);assert.equal(order.subtotalSource,undefined);}
 if(company==='Dgari')assert.match(order.materials[1].description,/26616 - Servicio Correctivo a bascula$/);
 if(company==='Agro Alimentos Puebla'){assert.equal(order.materials[0].code,'M0766');assert.equal(order.materials[1].description,'Porto Power ENERPAC 50 TN SCL502TB, 50 Ton, 2.38 in Stroke, Hydraulic Cylinder and Hand Pump Set');}
 if(company==='NutecGaleras'){assert.match(order.materials[1].description,/INFORME DE CALIBRAC$/);assert.ok(!order.materials.some(m=>/Necesario Para|Dirección/.test(m.description)));}
 if(company==='MInsa')assert.equal(order.materials[0].description,'CAL-002-039 - DIFUSOR TIPO STACK ROSCA 3" FNPT SEGMENTO APILADO');
 if(company==='Kerry'){assert.equal(order.materials[0].code,'900300501');assert.equal(order.materials[0].quantity,'2.000');}
 if(company==='Hexpol')assert.equal(order.materials[0].price,'6,950.00');
 if(company==='PPG Comex'){
 assert.deepEqual(order.materials.map(m=>[m.quantity,m.unit,m.amount,m.page]),[['1','pz','67,001.5500',1],['1','pz','18,273.1500',1],['1','pz','176,640.4500',2],['1','sv','48,467.3550',2]]);
 assert.match(order.materials[1].description,/Capacidad: 1,000 g X 0.1 g/);
 assert.match(order.materials[3].description,/Pruebas y comprobacion de su buen funcionamiento\.$/);
 assert.ok(!order.materials.some(m=>/NOTA|Subtotal|CFDI|atencionproveedores/.test(m.description)));
 assert.ok(order.warnings.some(w=>w.includes('dólares americanos')));
 assert.equal(extractOrder('Comex',rows).id,'');assert.equal(extractOrder('PPG AP Resinas',rows).id,'');
 const forced=extractOrder(company,rows,{usedOcr:true});assert.equal(forced.subtotal,'310,382.51');assert.equal(forced.subtotalSource,'calculated');
 }
 if(company==='PPG AP Resinas'){
 assert.equal(order.materials[0].description,'Patas niveladoras autocentrantes, la cual cuenta con las siguientes caracteristicas: Material Acero Inoxidable,medida 1/2 UNF X 3 in.');
 assert.equal(order.materials[1].description,'Base para pata de bascula de plataforma, la cual cuenta con las siguientes caracteristicas: Material Acero Inoxidable y tanque arpon.');
 assert.deepEqual(order.materials.map(m=>[m.quantity,m.unit,m.price,m.amount]),[['8','pz','2,150.0000','17,200.0000'],['8','pz','1,490.0000','11,920.0000']]);
 assert.equal(extractOrder('Comex',rows).id,'');assert.equal(extractOrder('PPG',rows).id,'');
 const forced=extractOrder(company,rows,{usedOcr:true});assert.equal(forced.subtotal,'29,120.00');assert.equal(forced.subtotalSource,'calculated');
 }
 if(company==='DSA'){assert.equal(order.materials[0].unit,'Unidades');assert.match(order.materials[0].description,/Acero Inoxidable$/);assert.ok(!order.materials[0].description.includes('COMPRAS'));}
 if(company==='Audace'){assert.equal(order.materials[0].quantity,'1.00');assert.equal(order.materials[0].unit,'UP');assert.equal(order.materials[0].price,'12,890.00');assert.match(order.materials[0].description,/TOLVA BASCULA/);}
 if(company==='Capistrano'){assert.equal(order.materials[1].price,'126,950.0000');assert.equal(order.materials[1].amount,'126,950.0000');assert.match(order.materials[1].description,/RICE LAKE$/);}
 if(company==='Cargill')assert.equal(order.materials.filter(m=>m.detail).length,9);
 assert.deepEqual([order.id,order.date,order.currency,order.subtotal,order.tax,order.total,order.materials.filter(m=>!m.detail).length],values,company);
 assert.ok(order.materials.every(m=>m.description.trim()&&m.quantity&&m.price&&m.amount),company+' incomplete items');
 if(company==='Nutribaq'){
 assert.equal(order.materials[0].code,'SERV0006');assert.equal(order.materials[0].price,'26,450.00');
 assert.ok(!order.warnings.some(w=>w.includes('no coincide')));
 }else assert.ok(!order.warnings.some(w=>w.includes('no coincide')),company+' totals');
 if(company==='JhonsonMatthey'){assert.equal(order.materials.filter(m=>m.detail).length,5);assert.match(order.materials[1].description,/equipos/);}
 if(company==='MartinSproket')assert.match(order.materials[1].description,/integración de posicionador/);
 assert.equal(extractOrder(company==='OMG'?'MEI':'OMG',rows).materials.length,0,'wrong company');
 console.log('PASS',company);
 }finally{await task.destroy();}
}
assert.equal(extractOrder('Bachoco',[]).tax,'');
console.log('PASS empty document and company mismatch');




