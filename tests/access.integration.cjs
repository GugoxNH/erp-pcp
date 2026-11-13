// Explicitly run with: node --env-file=.env.local tests/access.integration.cjs
// Creates disposable QA identities via Auth and removes only those identities.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {createServerClient}=require('@supabase/ssr');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const created=[];
// Exercise the real Server Actions with request-local cookie/redirect adapters.
const Module=require('node:module'),fs=require('node:fs'),swc=require('next/dist/build/swc');
let requestCookies=new Map();
const originalLoad=Module._load;
Module._load=function(name,parent,isMain){
  if(name==='server-only')return {};
  if(name==='next/headers')return {cookies:async()=>({getAll:()=>[...requestCookies].map(([name,value])=>({name,value})),get:name=>requestCookies.has(name)?{value:requestCookies.get(name)}:undefined,set:(name,value)=>requestCookies.set(name,value),delete:name=>requestCookies.delete(name)}),headers:async()=>new Headers()};
  if(name==='next/navigation')return {redirect:destination=>{throw Object.assign(new Error('TEST_REDIRECT'),{destination});}};
  return originalLoad.call(this,name,parent,isMain);
};
require.extensions['.ts']=(m,f)=>m._compile(swc.transformSync(fs.readFileSync(f,'utf8'),{filename:f,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,f);
const {createUser,getUsers}=require('../app/user-actions.ts');
const {login}=require('../app/auth/actions.ts');
async function fixture(grants){
  const username='qa-'+randomUUID().slice(0,16),password=randomUUID()+randomUUID();
  const {data:dev,error:de}=await admin.from('app_profiles').select('user_id').eq('is_developer',true).limit(1).single();
  assert.ifError(de);
  const {data,error}=await admin.auth.admin.createUser({email:username+'@users.erp.invalid',password,email_confirm:true,app_metadata:{erp_profile:{username,full_name:'QA temporary access verification',sections:grants,created_by:dev.user_id}}});
  assert.ifError(error);created.push(data.user.id);
  const cookies=new Map();
  const db=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>cookies.set(v.name,v.value))}});
  const login=await db.auth.signInWithPassword({email:username+'@users.erp.invalid',password});assert.ifError(login.error);
  return {db,id:data.user.id,dev:dev.user_id,cookies};
}
(async()=>{
  try{
    const limited=await fixture(['products']),manager=await fixture(['users']);
    requestCookies=limited.cookies;
    assert.equal((await getUsers()).ok,false);
    assert.equal((await createUser({username:'not-created',full_name:'QA',sections:['users'],active:true},randomUUID())).ok,false);
    requestCookies=manager.cookies;
    const actionName='qa-'+randomUUID().slice(0,16),actionPassword=randomUUID()+randomUUID();
    const actionEmail=actionName+'@example.com';
    const creation=await createUser({username:actionName,email:actionEmail,full_name:'QA action test',sections:['clients'],active:true},actionPassword);
    assert.equal(creation.ok,true,creation.error);
    const {data:actionUser,error:actionError}=await admin.from('app_profiles').select('user_id').eq('username',actionName).single();assert.ifError(actionError);created.push(actionUser.user_id);
    requestCookies=new Map();
    const form=new FormData();form.set('email',actionName);form.set('password',actionPassword);form.set('next','/usuarios');
    let destination;
    try{const result=await login({},form);assert.fail(result.error || 'Expected redirect');}catch(e){if(!e.destination)throw e;destination=e.destination;}
    assert.equal(destination,'/clientes');
    requestCookies=new Map();form.set('email',actionEmail);
    try{const result=await login({},form);assert.fail(result.error || 'Expected redirect');}catch(e){if(!e.destination)throw e;assert.equal(e.destination,'/clientes');}
    console.log('PASS: real user Server Actions reject limited users, provision accounts and log in by username.');
    assert.equal((await limited.db.rpc('has_section',{section_name:'products'})).data,true);
    assert.equal((await limited.db.rpc('has_section',{section_name:'users'})).data,false);
    for(const table of ['clients','businesses','purchase_orders']){const r=await limited.db.from(table).select('*');assert.ifError(r.error);assert.equal(r.data.length,0);}
    const blocked=await limited.db.from('clients').insert({name:'QA forbidden'});assert.equal(blocked.error?.code,'42501');
    const direct=await limited.db.from('app_profiles').update({sections:['users']}).eq('user_id',limited.id);assert.equal(direct.error?.code,'42501');
    assert.match((await limited.db.rpc('save_purchase_order',{payload:{}})).error.message,/ORDER_FORBIDDEN/);
    const protectedProfile=(await manager.db.from('app_profiles').select('*').eq('user_id',manager.dev).single()).data;
    const protect=await manager.db.rpc('update_user_access',{target:manager.dev,expected:protectedProfile.updated_at,display_name:'QA',grants:['products'],enabled:false});assert.match(protect.error.message,/USER_PROTECTED/);
    const self=(await manager.db.from('app_profiles').select('*').eq('user_id',manager.id).single()).data;
    assert.match((await manager.db.rpc('update_user_access',{target:manager.id,expected:self.updated_at,display_name:'QA',grants:['products'],enabled:false})).error.message,/USER_PROTECTED/);
    const response=await fetch('http://127.0.0.1:3000/usuarios',{redirect:'manual',headers:{cookie:[...limited.cookies].map(([n,v])=>n+'='+v).join('; ')}});
    assert.equal(response.status,307);assert.match(response.headers.get('location'),/\/productos$/);
    const p=(await manager.db.from('app_profiles').select('*').eq('user_id',limited.id).single()).data;
    const edit=await manager.db.rpc('update_user_access',{target:limited.id,expected:p.updated_at,display_name:'QA edited',grants:['clients'],enabled:true});assert.ifError(edit.error);
    assert.equal((await limited.db.rpc('has_section',{section_name:'products'})).data,false);
    assert.equal((await limited.db.rpc('has_section',{section_name:'clients'})).data,true);
    const stale=await manager.db.rpc('update_user_access',{target:limited.id,expected:p.updated_at,display_name:'QA stale',grants:['users'],enabled:true});assert.match(stale.error.message,/USER_CONFLICT/);
    const latest=(await manager.db.from('app_profiles').select('*').eq('user_id',limited.id).single()).data;
    assert.ifError((await manager.db.rpc('update_user_access',{target:limited.id,expected:latest.updated_at,display_name:'QA disabled',grants:['clients'],enabled:false})).error);
    assert.equal((await limited.db.rpc('has_section',{section_name:'clients'})).data,false);
    console.log('PASS: Auth provisioning, scoped RLS, direct write denial, protected developer/self, route denial, revocation, stale edits and deactivation.');
  }finally{
    for(const id of created){
      const {error}=await admin.from('user_access_events').delete().eq('target_id',id);assert.ifError(error);
      assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
    console.log('QA identities removed:',created.length);
  }
})().catch(e=>{console.error('FAIL:',e.name,e.code ?? '',e.message); console.error(e.stack?.split('\n').filter(line=>line.includes('access.integration.cjs')).join('\n'));process.exitCode=1;});
