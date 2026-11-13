const assert = require('node:assert/strict');
const fs = require('node:fs');
const swc = require('next/dist/build/swc');
require.extensions['.ts'] = (module, filename) => module._compile(swc.transformSync(fs.readFileSync(filename, 'utf8'), {
 filename, jsc:{parser:{syntax:'typescript'},target:'es2020'}, module:{type:'commonjs'},
}).code, filename);
const {blankSupplier,validateSupplier}=require('../lib/suppliers.ts');
const {blankProduct,validateProduct}=require('../lib/products.ts');
const supplier={...blankSupplier(),name:' Test ',rfc:' aaa010101aaa '};
assert.equal(validateSupplier(supplier).name,'Test');
assert.equal(validateSupplier(supplier).rfc,'AAA010101AAA');
for(const patch of [{name:''},{email:'invalid'},{rfc:'123'},{active:'yes'},{phone:'x'.repeat(41)}])assert.throws(()=>validateSupplier({...supplier,...patch}));
const id='00000000-0000-4000-8000-000000000001';
const product={...blankProduct(),sku:'QA',name:'Test',supplier_ids:[id]};
assert.deepEqual(validateProduct(product).supplier_ids,[id]);
for(const ids of [[id,id],[''],[null],'bad'])assert.throws(()=>validateProduct({...product,supplier_ids:ids}));
assert.deepEqual(validateProduct({...product,supplier_ids:[]}).supplier_ids,[]);
console.log('PASS: suppliers and product supplier validation');
const contact={id:'contact-1',name:' Ana ',position:' Compras ',email:'ana@example.com',mobile:'5551234567'};
const many=validateSupplier({...supplier,contacts:[contact,{...contact,id:'contact-2',name:'Luis',email:''}]});
assert.equal(many.contacts.length,2);
assert.equal(many.contacts[0].position,'Compras');
assert.equal(many.contact_name,'Ana');
assert.equal(many.email,'ana@example.com');
assert.equal(validateSupplier({...supplier,contacts:[]}).contact_name,'');
for(const contacts of [[contact,contact],[{...contact,email:'bad'}],[{...contact,position:'x'.repeat(161)}],[{...contact,name:'',email:'',mobile:''}],null])
  assert.throws(()=>validateSupplier({...supplier,contacts}));
assert.deepEqual(validateProduct({...product,supplier_codes:{[id]:'  Ref-55  '}}).supplier_codes,{[id]:'Ref-55'});
assert.deepEqual(validateProduct(product).supplier_codes,{[id]:''});
assert.throws(()=>validateProduct({...product,supplier_codes:{[id]:'x'.repeat(81)}}));
assert.throws(()=>validateProduct({...product,supplier_codes:{[id]:123}}));
assert.throws(()=>validateProduct({...product,supplier_codes:[]}));
assert.deepEqual(validateProduct({...product,supplier_ids:[],supplier_codes:{[id]:'Old'}}).supplier_codes,{});
