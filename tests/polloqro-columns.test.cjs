const assert=require('node:assert/strict'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
const {extractOrder}=require('../lib/extract-order.ts');
const {draftFromExtraction,orderReviewWarnings}=require('../lib/purchase-orders.ts');
function row(cells,y=500){return {page:1,y,text:cells.map(c=>c[1]).join(' '),words:cells.map(([x,text])=>({x,text,y,width:.02}))};}
function documentRows(items){return [row([[0,'POLLO DE QUERETARO A 123 Fecha Expedición 13-oct-2026 M.N']]),row([[0,'DESCRIPCIÓN Y PRESENTACIÓN']]),...items.map(([quantity,price,amount],i)=>row([[.02,String(i+1)],[.08,quantity],[.14,'PZA'],[.18,'CODE'],[.3,'Refacción'],[.8,price],[.9,amount]],480-i*10)),row([[0,'SUMA 100.00']]),row([[0,'IVA 16.00']]),row([[0,'TOTAL 116.00']])];}
const cases=[
 ['26,680.00','1.00','26,680.00',true],
 ['1,000.00','10.00','10,000.00',true],
 ['2.00','12,650.00','25,300.00',false],
 ['100.00','1.00','100.00',false],
 ['101.00','2.00','202.00',false],
 ['1,000.00','0.50','500.00',false],
 ['1,000.00','0.00','0.00',false],
 ['5,000.00','50.00','250,000.00',false],
 ['1,000.00','1.00','50.00',false],
];
const rows=documentRows(cases),result=extractOrder('PolloQro',rows);
assert.equal(result.materials.length,cases.length);
cases.forEach(([quantity,price,amount,swap],i)=>{
 const item=result.materials[i];
 assert.equal(item.quantity,swap?price:quantity);
 assert.equal(item.price,swap?quantity:price);
 assert.equal(item.amount,amount);
 assert.equal(result.warnings.some(w=>w.includes(`partida ${i+1} (`)&&w.includes('se intercambiaron')),swap);
});
assert.deepEqual(extractOrder('PolloQro',rows),result,'reading does not mutate rows');
assert.equal(extractOrder('Grupo Abrego',rows).materials.length,0,'company isolation');
const draft=draftFromExtraction('pcp','qa',result,{name:'prueba.pdf',size:100},'PolloQro');
assert.equal(draft.items[0].quantity,'1');
assert.equal(Number(draft.items[0].unit_price),26680);
assert.ok(orderReviewWarnings(draft).some(w=>w.includes('se intercambiaron')));
// Private local samples are optional; synthetic coverage above is self-contained.
for(const name of ['PolloQro','PolloQro_1','PolloQro_2','PolloQro_3']){
 const path=`tmp/extraction/${name}.json`;if(!fs.existsSync(path))continue;
 const extracted=extractOrder('PolloQro',JSON.parse(fs.readFileSync(path,'utf8')));
 if(name==='PolloQro'){
  assert.equal(extracted.materials.length,30);
  assert.ok(extracted.materials.every(m=>Number(m.quantity)===1));
  assert.equal(extracted.warnings.filter(w=>w.includes('se intercambiaron')).length,30);
 }else{
  assert.equal(extracted.materials[0].quantity,name==='PolloQro_3'?'3.00':'2.00');
  assert.ok(!extracted.warnings.some(w=>w.includes('se intercambiaron')));
 }
}
console.log('PASS: PolloQro swapped/normal/mixed columns, conservative boundaries, original amounts and review warnings.');
