import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getDocument} from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {makeRows,extractOrder} from '../lib/extract-order.ts';
const root=process.argv[2];
if(!root)throw new Error('Indica la carpeta de los PDF Capistrano.');
for(const [name,id,count] of [['Capistrano','359',3],['Capistrano_2','5384',1]]){
 const task=getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,name+'.pdf'))),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
 try{
  const doc=await task.promise,rows=[];
  for(let n=1;n<=doc.numPages;n++){
   const p=await doc.getPage(n),v=p.getViewport({scale:1}),c=await p.getTextContent();
   rows.push(...makeRows(c.items.filter(i=>'str' in i).map(i=>({text:i.str,x:i.transform[4]/v.width,y:i.transform[5],width:i.width/v.width})),n));
  }
  const o=extractOrder('Capistrano',rows);
  assert.equal(o.id,id);assert.equal(o.materials.length,count);
  assert.equal(o.currency,'MXP');assert.ok(!o.warnings.some(w=>/no coincide|OC:/.test(w)));
  // A missing order number must not become 000 or the plant number 21000.
  const missing=rows.map(r=>({...r,words:r.words.filter(w=>w.text!==id),text:r.text.replace(new RegExp('^'+id+'\\s'), '')}));
  assert.equal(extractOrder('Capistrano',missing).id,'');
  if(name==='Capistrano_2'){
   assert.deepEqual([o.date,o.subtotal,o.tax,o.total],['16/12/25','28,950.00','4,632.00','33,582.00']);
   assert.match(o.materials[0].description,/ADICIONAL SALM$/);
  }
  console.log('PASS',name,id);
 }finally{await task.destroy();}
}
