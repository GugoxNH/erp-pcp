begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
set local role authenticated;
do $$
declare s1 uuid; s2 uuid; p jsonb; payload jsonb; product uuid; begin
 insert into public.suppliers(name) values('QA supplier rollback 1') returning id into s1;
 insert into public.suppliers(name) values('QA supplier rollback 2') returning id into s2;
 payload:=jsonb_build_object('sku','QA-SUPPLIERS-'||s1,'name','QA rollback','unit','Pieza','category','','brand','','model','','notes','','active',true,'client_codes','[]'::jsonb,'supplier_ids',jsonb_build_array(s1,s2));
 p:=public.save_product_catalog(payload);product:=(p->>'id')::uuid;
 if jsonb_array_length(p->'supplier_ids')<>2 then raise exception 'Missing supplier links'; end if;
 begin delete from public.suppliers where id=s1; raise exception 'Expected FK restriction'; exception when foreign_key_violation then null; end;
 update public.suppliers set active=false where id=s1;
 p:=public.save_product_catalog(payload,product,(p->>'updated_at')::timestamptz);
 begin perform public.save_product_catalog(payload,product,'2000-01-01');raise exception 'Expected stale rejection';exception when raise_exception then if sqlerrm<>'PRODUCT_STALE' then raise;end if;end;
 p:=public.save_product_catalog(jsonb_set(payload,'{supplier_ids}',jsonb_build_array(s2)),product,(p->>'updated_at')::timestamptz);
 begin perform public.save_product_catalog(payload,product,(p->>'updated_at')::timestamptz);raise exception 'Expected inactive rejection';exception when check_violation then null;end;
 if (select count(*) from public.product_suppliers where product_id=product)<>1 then raise exception 'Failed save changed links';end if;
 delete from public.suppliers where id=s1;
 delete from public.products where id=product;
 delete from public.suppliers where id=s2;
end $$;
reset role;
-- No profile means no catalog access, even through SECURITY DEFINER functions.
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.suppliers) then raise exception 'Supplier RLS leaked rows';end if;
 if exists(select 1 from public.product_supplier_options()) then raise exception 'Options leaked rows';end if;
 begin perform public.save_product_catalog('{}');raise exception 'Missing access check';exception when insufficient_privilege then null;end;
end $$;
rollback;
