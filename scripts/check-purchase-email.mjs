import {PGlite} from '../.tmp/warehouse-validation/node_modules/@electric-sql/pglite/dist/index.js';
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const db=new PGlite();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;");
for(const file of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
const me=randomUUID(),other=randomUUID(),purchase=randomUUID(),supplier=randomUUID(),request=randomUUID(),fingerprint='a'.repeat(64);
for(const [id,name] of [[me,'self'],[other,'other']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query("insert into app_profiles(user_id,username,full_name,sections) values($1,$2,$2,array['purchases'])",[id,name]);}
await db.query("insert into suppliers(id,name) values($1,'Test supplier')",[supplier]);
await db.query("insert into supplier_purchases(id,business_id,supplier_id,supplier_name,number,date,currency,status,tax,subtotal,total) values($1,'pcp',$2,'Test supplier','MAIL-TEST',current_date,'MXN','draft',0,1,1)",[purchase,supplier]);
await db.query("select set_config('test.uid',$1,false)",[me]);await db.exec('set role authenticated');
const claim=async(id=request,hash=fingerprint,business='pcp')=>(await db.query('select claim_purchase_email($1,$2,$3,$4,$5) as r',[id,purchase,business,hash,{provider:'company',from:'sender@example.test',to:['receiver@example.test']}])).rows[0].r;
assert.equal((await claim()).claimed,true);assert.equal((await claim()).claimed,false);
await assert.rejects(claim(request,'b'.repeat(64)),/EMAIL_CONFLICT/);
await assert.rejects(claim(randomUUID(),fingerprint,'taasa'),/EMAIL_PURCHASE_UNAVAILABLE/);
await assert.rejects(db.query("select finish_purchase_email($1,$2,'sent','{}')",[request,me]),/permission denied/);
await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[other]);await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int as n from purchase_email_sends')).rows[0].n,0);
await assert.rejects(claim(),/EMAIL_CONFLICT/);
await db.exec('set role service_role');
await db.query("select finish_purchase_email($1,$2,'sent',$3)",[request,me,{message:'Aceptado',messageId:'test'}]);
await db.query("select finish_purchase_email($1,$2,'failed',$3)",[request,me,{message:'Late duplicate'}]);
await db.exec('reset role');
assert.equal((await db.query('select state from purchase_email_sends where id=$1',[request])).rows[0].state,'sent');
assert.equal((await db.query("select count(*)::int as n from activity_log where action='purchase.email.sent'")).rows[0].n,1);
await db.query("select set_config('test.uid',$1,false)",[me]);
for(const outcome of ['failed','partial','unknown']){
 await db.exec('set role authenticated');const id=randomUUID();await claim(id);
 await db.exec('set role service_role');await db.query('select finish_purchase_email($1,$2,$3,$4)',[id,me,outcome,{message:'Test outcome'}]);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from activity_log where action=$1',['purchase.email.'+outcome])).rows[0].n,1);
}
await db.query("update app_profiles set sections=array['products'] where user_id=$1",[me]);await db.exec('set role authenticated');await assert.rejects(claim(randomUUID()),/EMAIL_FORBIDDEN/);
await db.exec('set role anon');await assert.rejects(claim(randomUUID()),/permission denied/);
await db.close();console.log('PASS: durable send claim, duplicate prevention, payload conflicts, user isolation, section permissions and atomic outcome/audit.');
