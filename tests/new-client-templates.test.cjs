const assert=require('node:assert/strict'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
const {extractOrder}=require('../lib/extract-order.ts');
const {draftFromExtraction}=require('../lib/purchase-orders.ts');
for(const [name,id,count,tax,delivery] of [['Grupak','3028685',2,'4,608.00','2026-07-20'],['SuKarne','4401298642',3,'104,648.00','2026-08-28'],['Taylor farms_v2','PO-26-062804',1,'3128.00','2026-06-05']]) {
 const rows=JSON.parse(fs.readFileSync(`tmp/${name}-rows.json`)),company=name.replace('_v2','');
 const result=extractOrder(company,rows);
 assert.equal(result.id,id);assert.equal(result.materials.length,count);assert.equal(result.tax,tax);
 assert.deepEqual(result.warnings,[]);
 assert.ok(result.materials.every(m=>m.commitmentDate===delivery));
 const draft=draftFromExtraction('pcp','qa',result,{name:name+'.pdf',size:100},company);
 if(company==='Grupak') assert.deepEqual(draft.items.map(m=>m.kind),['service','parts']);
 if(company==='SuKarne') {
  assert.equal(result.materials[0].code,'000000001000000890');
  assert.deepEqual(draft.items.map(m=>m.kind),['parts','parts','service']);
  const changed=structuredClone(rows),r=changed.find(r=>r.text.startsWith('00020'));
  r.words.find(w=>w.text==='28.08.2026').text='29.08.2026';r.text=r.text.replace('28.08.2026','29.08.2026');
  assert.deepEqual(extractOrder(company,changed).materials.map(m=>m.commitmentDate),['2026-08-28','2026-08-29','2026-08-28']);
 }
 if(company==='Taylor farms') {
  assert.equal(draft.order_date,'2026-06-05');
  assert.equal(result.materials[0].price,'19550.00');
  assert.equal(result.materials[0].amount,'19550.00');
  assert.equal(result.materials[0].description,'CELDA DE CARGA MODELO RC3 PARA BASCULA CAMIONERA 2');
 }
 for(const other of ['Grupak','SuKarne','Taylor farms'].filter(c=>c!==company)) assert.equal(extractOrder(other,rows).id,'','reject wrong company');
}
console.log('PASS: new PDF formats, wrapped values, item types, delivery dates and signature isolation.');
