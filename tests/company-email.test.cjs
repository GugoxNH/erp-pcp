const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
process.env.GMAIL_TOKEN_ENCRYPTION_KEY='ac'.repeat(32);
let options,fail=false,allowed=true,calls=[],closed=0,limited=false;
const load=Module._load;
Module._load=function(name,parent,main){
 if(name==='server-only')return {};
 if(name==='next/cache')return {revalidatePath(){}};
 if(name==='nodemailer')return {createTransport(o){options=o;return {verify:async()=>{if(fail)throw Object.assign(Error('private server details'),{code:'EAUTH'});},close(){closed++;}};}};
 if(name.endsWith('/access-server'))return {requireAccess:async()=>{if(!allowed)throw Error('denied');return {user:{id:'self'}};}};
 if(name.endsWith('/supabase/admin'))return {createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:limited?{message:'EMAIL_RATE_LIMIT'}:null};}})};
 return load.call(this,name,parent,main);
};
const {companyEmailInput}=require('../lib/company-email.ts');
const {validateCompanyEmail}=require('../app/company-email-actions.ts');
const {openGmail}=require('../lib/gmail-crypto.ts');
(async()=>{
 assert.throws(()=>companyEmailInput('x@evil.test','password'));
 assert.throws(()=>companyEmailInput('admin@pesaje.com.mx',''));
 let result=await validateCompanyEmail('ADMIN@pesaje.com.mx',' test secret ');assert.equal(result.ok,true);
 assert.equal(options.host,'mail.pesaje.com.mx');assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.debug,false);assert.equal(options.auth.pass,' test secret ');
 const saved=calls.find(x=>x.name==='finish_company_email_check').args;
 assert.equal(saved.owner_id,'self');assert.equal(openGmail(saved.encrypted_password,'company-email:self'),' test secret ');assert.throws(()=>openGmail(saved.encrypted_password,'company-email:other'));assert.equal(closed,1);
 calls=[];fail=true;result=await validateCompanyEmail('admin@pesaje.com.mx','wrong');assert.equal(result.ok,false);assert.ok(!result.error.includes('private server details'));assert.equal(calls.length,1);assert.equal(closed,2);
 calls=[];allowed=false;assert.equal((await validateCompanyEmail('admin@pesaje.com.mx','password')).ok,false);assert.equal(calls.length,0);
 allowed=true;limited=true;assert.equal((await validateCompanyEmail('admin@pesaje.com.mx','password')).ok,false);assert.equal(closed,2);
 console.log('PASS: SMTP TLS, authenticated ownership, domain restriction, encrypted password, rejection and throttling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
