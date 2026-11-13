begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
set local role authenticated;
do $$
declare sid uuid; entries jsonb:='[{"id":"a","name":"Ana","position":"Compras","email":"ana@example.com","mobile":"123"},{"id":"b","name":"Luis","position":"Ventas","email":"","mobile":""}]';
begin
insert into public.suppliers(name,phone,contacts) values('QA contacts rollback','555',entries) returning id into sid;
if not exists(select 1 from public.suppliers where id=sid and jsonb_array_length(contacts)=2 and contact_name='Ana' and phone='555') then raise exception 'Contacts not saved';end if;
begin update public.suppliers set contacts=entries||jsonb_build_array(entries->0) where id=sid; raise exception 'Duplicates accepted';exception when check_violation then null;end;
begin update public.suppliers set contacts=jsonb_set(entries,'{0,email}','"invalid"') where id=sid; raise exception 'Bad email accepted';exception when check_violation then null;end;
update public.suppliers set contacts=jsonb_build_array(entries->1) where id=sid;
if not exists(select 1 from public.suppliers where id=sid and contact_name='Luis' and email='' and phone='555') then raise exception 'Contact removal failed';end if;
update public.suppliers set contacts='[]' where id=sid;
if not exists(select 1 from public.suppliers where id=sid and contact_name='' and mobile='') then raise exception 'Clear failed';end if;
end $$;
rollback;
