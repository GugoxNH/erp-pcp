const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),swc=require('next/dist/build/swc');
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
let allowed=true,profile={user_id:'target',username:'worker',is_developer:false,active:true,sections:['products'],updated_at:'v1'},storedEmail='old@example.com',created,updates=0,loginEmail;
const chain=result=>({select(){return this},eq(){return this},single:async()=>result,maybeSingle:async()=>result});
const db={from:()=>chain({data:profile,error:null}),auth:{signInWithPassword:async v=>{loginEmail=v.email;return {data:{user:{id:'target'}},error:null};}}};
const admin={from:()=>chain({data:null,error:null}),auth:{admin:{getUserById:async()=>({data:{user:{email:storedEmail}},error:null}),createUser:async values=>{created=values;return {error:null};},updateUserById:async(id,values)=>{updates++;storedEmail=values.email;return {error:null};}}}};
const load=Module._load;
Module._load=function(name,parent,main){
  if(name==='server-only')return {};
  if(name.endsWith('/access-server'))return {requireAccess:async()=>{if(!allowed)throw new Error('Forbidden');return {db,user:{id:'manager'}};}};
  if(name.endsWith('/supabase/admin'))return {createAdminClient:()=>admin};
  if(name.endsWith('/supabase/server'))return {createClient:async()=>db};
  if(name==='next/headers')return {cookies:async()=>({set(){}})};
  if(name==='next/navigation')return {redirect:path=>{throw Object.assign(new Error('redirect'),{path});}};
  return load.call(this,name,parent,main);
};
const {createUser,updateUserEmail}=require('../app/user-actions.ts');
const {login}=require('../app/auth/actions.ts');
(async()=>{
  const input={username:'worker',full_name:'Worker Test',email:' New@Example.com ',sections:['products'],active:true};
  assert.equal((await createUser(input,'test-password-only')).ok,true);assert.equal(created.email,'new@example.com');
  assert.equal((await createUser({...input,email:''},'test-password-only')).ok,false);
  assert.equal((await updateUserEmail('target','v1','old@example.com','new@example.com')).ok,true);assert.equal(storedEmail,'new@example.com');
  assert.equal((await updateUserEmail('target','v1','old@example.com','other@example.com')).ok,false);
  profile.is_developer=true;assert.equal((await updateUserEmail('target','v1',storedEmail,'other@example.com')).ok,false);profile.is_developer=false;
  assert.equal((await updateUserEmail('target','old',storedEmail,'other@example.com')).ok,false);
  allowed=false;assert.equal((await updateUserEmail('target','v1',storedEmail,'other@example.com')).ok,false);allowed=true;assert.equal(updates,1);
  admin.from=()=>chain({data:{user_id:'target'},error:null});
  for(const identifier of ['worker','NEW@EXAMPLE.COM']){
    const form=new FormData();form.set('email',identifier);form.set('password','test-password-only');
    await assert.rejects(()=>login({},form),e=>e.path==='/productos');assert.equal(loginEmail,'new@example.com');
  }
  console.log('PASS: real-email creation, protected email updates, conflicts and both login identifiers (mocked Auth).');
})().catch(e=>{console.error(e);process.exitCode=1;});
