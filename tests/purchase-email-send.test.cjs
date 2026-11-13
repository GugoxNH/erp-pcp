const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
process.env.GMAIL_TOKEN_ENCRYPTION_KEY='ac'.repeat(32);
const {sealGmail}=require('../lib/gmail-crypto.ts');
let transportOptions,mail,mode='success',missing=false,fetches=0,provider='company';
const load=Module._load;
Module._load=function(name,parent,main){
 if(name==='server-only')return {};
 if(name==='nodemailer')return {createTransport(options){transportOptions=options;return {sendMail:async(message)=>{mail=message;if(options.streamTransport)return {message:Buffer.from('mime')};if(mode==='auth')throw Object.assign(Error('secret server response'),{code:'EAUTH'});if(mode==='timeout')throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});return {accepted:['to@example.test'],rejected:mode==='partial'?['cc@example.test']:[],messageId:'test'};},close(){}};}};
 if(name.endsWith('/supabase/admin'))return {createAdminClient:()=>({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({error:null,data:missing?null:provider==='company'?{email:'admin@pesaje.com.mx',host:'mail.pesaje.com.mx',port:465,password_encrypted:sealGmail('private','company-email:self')}:{email:'test@gmail.com',refresh_token_encrypted:sealGmail('refresh','self')}})})})};
 if(name==='./gmail')return {gmailClient:()=>({setCredentials(){},getAccessToken:async()=>({token:'access'})}),gmailStatus:async()=>({ready:true,email:'test@gmail.com'})};
 return load.call(this,name,parent,main);
};
global.fetch=async()=>{fetches++;if(mode==='timeout')throw Error('network');return {ok:mode!=='reject',status:mode==='reject'?403:200,json:async()=>({id:'gmail-id'})};};
const {deliverPurchaseEmail}=require('../lib/purchase-email-send.ts');const {parsePurchaseEmail}=require('../lib/purchase-email-model.ts');
const fields={requestId:'a1234567-1234-4123-8123-123456789abc',purchase:'b1234567-1234-4123-8123-123456789abc',business:'pcp',provider:'company',sender:'admin@pesaje.com.mx',to:'to@example.test',cc:'cc@example.test',subject:'OC áé',body:'Prueba ñ'};
function form(patch={}){const f=new FormData();Object.entries({...fields,...patch}).forEach(([k,v])=>f.set(k,v));f.append('files',new File(['PDF bytes'],'orden.pdf'));return f;}
(async()=>{
 let input=await parsePurchaseEmail(form());assert.equal(input.attachments[0].content.toString(),'PDF bytes');
 await assert.rejects(parsePurchaseEmail(form({to:'bad\r\nBcc:evil@example.test'})));
 await assert.rejects(parsePurchaseEmail(form({subject:'bad\nheader'})));
 const second=await parsePurchaseEmail(form({body:'other'}));assert.notEqual(input.fingerprint,second.fingerprint);
 assert.equal((await deliverPurchaseEmail('self',input)).state,'sent');assert.equal(mail.from,'admin@pesaje.com.mx');assert.deepEqual(mail.to,['to@example.test']);assert.equal(mail.attachments[0].filename,'orden.pdf');assert.equal(transportOptions.tls.rejectUnauthorized,true);
 mode='partial';assert.equal((await deliverPurchaseEmail('self',input)).state,'partial');
 mode='auth';const rejected=await deliverPurchaseEmail('self',input);assert.equal(rejected.state,'failed');assert.ok(!rejected.message.includes('secret'));
 mode='timeout';assert.equal((await deliverPurchaseEmail('self',input)).state,'unknown');
 missing=true;assert.equal((await deliverPurchaseEmail('self',input)).state,'failed');missing=false;
 provider='gmail';input={...input,provider:'gmail',sender:'test@gmail.com'};
 mode='success';assert.equal((await deliverPurchaseEmail('self',input)).state,'sent');assert.equal(fetches,1);
 mode='reject';assert.equal((await deliverPurchaseEmail('self',input)).state,'failed');assert.equal(fetches,2);
 mode='timeout';assert.equal((await deliverPurchaseEmail('self',input)).state,'unknown');assert.equal(fetches,3);
 console.log('PASS: attachments, validation, fingerprint, SMTP/Gmail selection, TLS, partial delivery, errors and no Gmail retries. No email sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
