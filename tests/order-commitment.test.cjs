const assert=require('node:assert/strict'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
const {extractCommitment}=require('../lib/order-commitment.ts');
const {extractOrder}=require('../lib/extract-order.ts');
const row=(text,x=0,y=500,page=1)=>({text,words:[{text,x,y,width:.1}],y,page});
for(const [company,text,wanted] of [
 ['Bachoco','Fecha de entrega 20.06.2026','2026-06-20'],['Campi','Fecha de entrega 10.06.2026','2026-06-10'],
 ['Agrogen','México Fecha de entrega 06.02.2026','2026-02-06'],['Audace','Fech. Entrega. 30.09.2026','2026-09-30'],
 ['Grupo Abrego','FECHA DE ENTREGA 17/07/2026 12:00:00a.m. ENTREGAR EN:','2026-07-17'],
 ['Nutribaq','FECHA DE ENTREGA: 18/03/2026 12:00:00a.m.','2026-03-18'],
 ['Pilgrims','Fe. Entrega: 27/02/2026 Barrio: -','2026-02-27'],['Pilgrims','Fc. Entrega: 31/05/2026 Barrio: -','2026-05-31'],
 ['Euro Nutec','Envío 1 : Necesario Para: 07-MAY-2026 16:35:04','2026-05-07'],['NutecGaleras','Necesario Para: 17-JUN-2026','2026-06-17'],
 ['Hexpol','Delivery Date: 01/14/2026','2026-01-14'],['MEI','Delivery Date 03/30/2026','2026-03-30']
]) assert.equal(extractCommitment(company,[row(text)],'').date,wanted,company);
for(const [company,header,x,date] of [
 ['JhonsonMatthey','Item No JM Code Delivery',.726,'30.09.2026'],['MartinSproket','de línea Descripción Entrega',.534,'01/04/2026'],
 ['Cargill','culo Material Unitario Entrega',.621,'11.09.2026'],['Ceypabasa','Descripción Entrega Cantidad',.401,'30/01/2026'],
 ['Daltile','LIN ARTICULO ENVIAR',.356,'29-MAY-26'],['Empacadora','Numero de No Parte Fecha',.888,'02/07/26'],
 ['Capistrano','Articulo Proveedor UM Entrega',.887,'23/01/26'],['Dgari','Pos. Artículo Fecha entrega',.26,'10.07.2026'],
 ['MInsa','PDA FECHA ENT',.639,'12/02/2026'],['Kerry','Item Material Delivery Date',.913,'23.05.2026'],
 ['PPG','Línea Artículo Fecha de Entrega',.36,'30-JAN-2026'],['Taylor farms','Description Delivery Quantity',.311,'8/7/2026']
]) {
 const result=extractCommitment(company,[row('Fecha 01/01/2026',x,600),row(header),row(date,x,480)],'');
 assert.ok(result.date,company);assert.equal(result.evidence.length,1,company);
 assert.equal(extractCommitment(company,[row(header),row(date,x,480,2)],'').date,'','reset table on new page');
 assert.equal(extractCommitment(company,[row(header),row('TOTAL'),row(date,x,480)],'').date,'','ignore footer');
}
assert.equal(extractCommitment('Agro Alimentos Puebla',[row('Fecha de Entrega:'),row('24/03/2026',.728,480)],'').date,'2026-03-24');
assert.equal(extractCommitment('Ferroservicios',[row('Fecha de Entrega:'),row('24/03/2026',.698,480)],'').date,'2026-03-24');
assert.equal(extractCommitment('Calquimica',[row('05/06/2026',.254,510),row('FECHA DE ENTREGA CÓDIGO DE PROVEEDOR')],'').date,'2026-06-05');
assert.equal(extractCommitment('Ingredion',[row('FECHA ORDEN DE COMPRA FECHA DE ENTREGA'),row('21.05.2026',.213,480)],'').date,'2026-05-21');
const multiple=extractCommitment('Bachoco',[row('Fecha de entrega 20.06.2026'),row('Fecha de entrega 21.06.2026')],'');
assert.equal(multiple.date,'');
assert.equal(extractCommitment('Bachoco',[row('Fecha de entrega 20.06.2026'),row('Fecha de entrega 20.06.2026')],'').date,'2026-06-20');
assert.equal(extractCommitment('MEI',[row('Delivery Date 05/13/2026')],'05/20/2026').date,'2026-05-13');
assert.match(extractCommitment('MEI',[row('Delivery Date 05/13/2026')],'05/20/2026').warnings[0],/anterior/);
assert.match(extractCommitment('Bachoco',[row('Fecha de entrega 31/02/2026')],'').warnings[0],/no válidas/);
for(const company of ['Ceat','OMG','Comex','PPG AP Resinas','PPG Comex','Sherwin','inovatelia','DSA','PolloQro']) assert.equal(extractCommitment(company,[row('Fecha 01/01/2026'),row('Tiempo de entrega: 15 días'),row('Fecha de solicitud 02/01/2026')],'').date,'');
assert.equal(extractOrder('Bachoco',[row('OTRA EMPRESA Fecha de entrega 20.06.2026')]).commitmentDate,undefined,'signature must match');
console.log('PASS: inspected delivery fields, date normalization, ambiguity, invalid dates, signatures and table boundaries.');
