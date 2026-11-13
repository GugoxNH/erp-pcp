begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
do $$ declare cid text:=gen_random_uuid()::text; imported text:=gen_random_uuid()::text; row_data public.clients; payload jsonb; begin
  insert into public.clients(id,name,contact,email,phone) values(cid,'QA contacts '||cid,'Legacy','legacy@example.com','123');
  select * into row_data from public.clients where id=cid;
  if jsonb_array_length(row_data.contacts)<>1 or row_data.contacts->0->>'email'<>'legacy@example.com' then raise exception 'Legacy conversion failed'; end if;
  update public.clients set contacts='[{"id":"a","name":"Compras","area":"Compras","email":"a@example.com","phone":"123"},{"id":"b","name":"Almacen","area":"Recepcion","email":"b@example.com","phone":"456"}]'::jsonb where id=cid;
  update public.clients set contact='Compras actualizadas' where id=cid;
  select * into row_data from public.clients where id=cid;
  if row_data.contact<>'Compras actualizadas' or row_data.contacts->0->>'area'<>'Compras' or jsonb_array_length(row_data.contacts)<>2 then raise exception 'Legacy write lost contacts'; end if;
  payload:=(to_jsonb(row_data)-array['created_at','updated_at'])||jsonb_build_object('id',imported,'name','QA import '||imported);
  perform public.import_local_catalogs(jsonb_build_object('clients',jsonb_build_array(payload),'businesses','[]'::jsonb,'links','[]'::jsonb));
  if (select jsonb_array_length(contacts) from public.clients where id=imported)<>2 then raise exception 'Import lost contacts'; end if;
  perform public.import_local_catalogs(jsonb_build_object('clients',jsonb_build_array(payload),'businesses','[]'::jsonb,'links','[]'::jsonb));
  update public.clients set contacts='[]'::jsonb where id=cid;
  if exists(select 1 from public.clients where id=cid and (contact<>'' or email<>'' or phone<>'')) then raise exception 'Clearing contacts failed'; end if;
  begin
    update public.clients set contacts='[{"id":"dup","name":"A","area":"","email":"","phone":""},{"id":"dup","name":"B","area":"","email":"","phone":""}]'::jsonb where id=cid;
    raise exception 'Duplicate id accepted';
  exception when check_violation then null; end;
end $$;
rollback;
