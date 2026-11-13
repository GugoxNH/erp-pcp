require('./purchase-orders.test.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {extractOrder}=require('../lib/extract-order.ts');
const {draftFromExtraction,validateOrder,totals}=require('../lib/purchase-orders.ts');
const {inheritedCode}=require('../lib/order-subitems.ts');
for(const name of ['Cargill','JhonsonMatthey']) {
 const read=extractOrder(name,JSON.parse(fs.readFileSync(`tmp/extraction/${name}.json`)));
 const draft=draftFromExtraction('pcp','qa',read,{name:'test.pdf',size:1},name);
 assert.equal(draft.items.reduce((s,i)=>s+i.subitems.length,0),read.materials.filter(m=>m.detail).length);
 assert.ok(draft.items.some(i=>i.subitems.length));
 assert.equal(totals(draft.items,'0').subtotal,totals(draft.items.map(i=>({...i,subitems:[]})),'0').subtotal);
 if(name==='Cargill') {
  assert.equal(draft.items.length,9);assert.ok(draft.items.every(i=>i.code==='3000501'&&i.subitems.length===1));
  const validated=validateOrder(draft);assert.equal(validated.items[0].subitems[0].code,'3000501');
  assert.throws(()=>validateOrder({...draft,items:[{...draft.items[0],subitems:[{...draft.items[0].subitems[0],quantity:'-1'}]}]}));
 }
}
assert.equal(inheritedCode('MAIN',[{code:'SUB'}]),'MAIN');
assert.equal(inheritedCode('',[{code:'SUB'},{code:'SUB'}]),'SUB');
assert.equal(inheritedCode('',[{code:'A'},{code:'B'}]),'');
console.log('PASS: Cargill and Johnson subitems preserved, inherited codes and no double counting.');
