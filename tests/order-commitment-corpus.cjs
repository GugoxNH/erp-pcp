// Local PDF/OCR samples are private and intentionally not copied into the tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
const {extractOrder}=require('../lib/extract-order.ts');
const root=process.argv[2]||'tmp/extraction';
const expected={
 'Agro Alimentos Puebla':'2026-03-24','Agro Alimentos Puebla_1':'2026-05-23','Agro Alimentos Puebla_2':'2026-06-19','Agro Alimentos Puebla_3':'2026-03-23','Agro Alimentos Puebla_4':'2026-01-30',
 Agrogen:'2026-02-06',Audace:'2026-09-30',Bachoco:'2026-06-20',Calquimica:'2026-06-05',Campi:'2026-06-10',Capistrano:'2026-01-23',Capistrano_2:'2026-01-09',
 Cargill:'2026-09-11',Ceat:'',Ceypabasa:'2026-01-30',Comex:'',Daltile:'2026-05-29',Dgari:'2026-07-10',Dgari_2:'2025-10-10',Dgari_3:'2026-01-19',DSA:'',Empacadora:'2026-07-02',
 'Euro Nutec':'2026-05-07',Ferroservicios:'2026-03-24','Grupo Abrego':'2026-07-17',GrupoAbrego_1:'2025-12-24',GrupoAbrego_2:'2025-12-24',GrupoAbrego_3:'2026-06-04',GrupoAbrego_4:'2026-08-29',GrupoAbrego_5:'2026-07-17',
 Hexpol:'2026-01-14',Ingredion:'2026-05-21',inovatelia:'',JhonsonMatthey:'',Kerry:'2026-05-23',MartinSproket:'2026-04-01',MEI:'2026-05-13',MInsa:'2026-02-12',NutecGaleras:'2026-06-17',Nutribaq:'2026-03-18',OMG:'',
 pilgrims_v1:'2026-02-27',pilgrims_v2:'2026-03-28',pilgrims_v3:'2026-04-30',pilgrims_v4:'2026-05-31',PolloQro:'',PolloQro_1:'',PolloQro_2:'',PolloQro_3:'',
 'PPG AP Resinas':'','PPG Comex':'',PPG_1:'2026-01-30',PPG_2:'2026-03-04',PPG_3:'2026-07-29',Sherwin:'','Taylor farms':'2026-08-07',
};
for(const [name,date] of Object.entries(expected)) {
 const company=name.replace(/_[1-4]$/,'').replace(/^pilgrims_v\d$/,'Pilgrims').replace(/^GrupoAbrego.*$/,'Grupo Abrego');
 const rows=JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
 const result=extractOrder(company,rows);
 assert.equal(result.commitmentDate,date,name);
 if(name==='JhonsonMatthey') assert.deepEqual(result.materials.filter(m=>!m.detail).map(m=>m.commitmentDate),['2026-09-30','2026-09-26','2026-11-25','2026-11-25','2026-11-25']);
 if(date) for(const item of result.materials.filter(m=>!m.detail)) assert.equal(item.commitmentDate,date,name+' item');
 if(!date && name!=='JhonsonMatthey') assert.ok(result.warnings.some(w=>w.startsWith('Fecha compromiso')),name);
 if(name==='pilgrims_v2') for(const plant of ['Tepeji','San Luis Potosí','Cuez','Laguna 2','Popular','Porvenir','5 de Febrero']) assert.equal(extractOrder('Pilgrims - '+plant,rows).commitmentDate,date,plant);
 if(name==='NutecGaleras') assert.equal(extractOrder('NutecJCF',rows).commitmentDate,date);
 if(name==='Cargill') assert.ok(extractOrder('Cargil Irapuato',rows).commitmentEvidence.length);
}
console.log(`PASS: ${Object.keys(expected).length} local PDF/OCR samples and shared-template aliases.`);
