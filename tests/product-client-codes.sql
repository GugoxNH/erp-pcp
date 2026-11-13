begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
do $$ declare cid text:=gen_random_uuid()::text; cid2 text:=gen_random_uuid()::text; p jsonb; saved jsonb; updated jsonb; begin
 insert into public.clients(id,name) values(cid,'QA codes '||cid),(cid2,'QA codes '||cid2);
 p:=jsonb_build_object('sku','QA-'||cid,'name','QA product','unit','Pieza','category','','brand','','model','','notes','','active',true,'client_codes',jsonb_build_array(jsonb_build_object('client_id',cid,'code','00555'),jsonb_build_object('client_id',cid2,'code','777')));
 saved:=public.save_product_with_codes(p);
 if jsonb_array_length(saved->'client_codes')<>2 then raise exception 'Missing codes'; end if;
 if not exists(select 1 from public.product_client_codes where product_id=(saved->>'id')::uuid and code='00555') then raise exception 'Leading zero lost'; end if;
 begin
  perform public.save_product_with_codes(p||jsonb_build_object('sku','QA-'||cid2));
  raise exception 'Duplicate accepted';
 exception when unique_violation then null; end;
 if exists(select 1 from public.products where sku='QA-'||upper(cid2)) then raise exception 'Partial save'; end if;
 begin
  perform public.save_product_with_codes(p,(saved->>'id')::uuid,'2000-01-01'::timestamptz);
  raise exception 'Stale save accepted';
 exception when raise_exception then if sqlerrm<>'PRODUCT_STALE' then raise; end if; end;
 updated:=public.save_product_with_codes(p||jsonb_build_object('client_codes','[]'::jsonb),(saved->>'id')::uuid,(saved->>'updated_at')::timestamptz);
 if updated->'client_codes'<>'[]'::jsonb then raise exception 'Removal failed'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.save_product_with_codes(p);
  raise exception 'Unauthenticated save accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
