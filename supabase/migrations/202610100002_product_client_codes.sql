begin;
create table public.product_client_codes (
  product_id uuid not null references public.products(id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  code text not null check(length(btrim(code)) between 1 and 80),
  primary key(product_id,client_id,code)
);
create unique index product_client_code_unique on public.product_client_codes(client_id,upper(btrim(code)));
alter table public.product_client_codes enable row level security;
revoke all on public.product_client_codes from anon,authenticated;
grant select on public.product_client_codes to authenticated;
create policy product_codes_read on public.product_client_codes for select to authenticated using(public.has_section('products'));

create function public.product_client_options() returns table(id text,name text,active boolean)
language sql stable security definer set search_path='' as $$
 select id,name,active from public.clients where public.has_section('products') order by name,id;
$$;
revoke all on function public.product_client_options() from public,anon;
grant execute on function public.product_client_options() to authenticated;

create function public.save_product_with_codes(payload jsonb, product_id uuid default null, expected_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.products; entry jsonb; codes jsonb := payload->'client_codes'; begin
 if not public.has_section('products') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if jsonb_typeof(codes) is distinct from 'array' then raise exception 'INVALID_CODES' using errcode='23514'; end if;
 if product_id is not null then
   select * into saved from public.products where id=product_id for update;
   if not found or expected_version is null or saved.updated_at<>expected_version then raise exception 'PRODUCT_STALE'; end if;
   update public.products set sku=upper(btrim(payload->>'sku')),name=payload->>'name',unit=payload->>'unit',category=payload->>'category',brand=payload->>'brand',model=payload->>'model',notes=payload->>'notes',active=(payload->>'active')::boolean where id=product_id returning * into saved;
 else
   insert into public.products(sku,name,unit,category,brand,model,notes,active) values(upper(btrim(payload->>'sku')),payload->>'name',payload->>'unit',payload->>'category',payload->>'brand',payload->>'model',payload->>'notes',(payload->>'active')::boolean) returning * into saved;
 end if;
 delete from public.product_client_codes c where c.product_id=saved.id;
 for entry in select value from jsonb_array_elements(codes) loop
   if jsonb_typeof(entry->'client_id') is distinct from 'string' or jsonb_typeof(entry->'code') is distinct from 'string' then raise exception 'INVALID_CODES' using errcode='23514'; end if;
   insert into public.product_client_codes(product_id,client_id,code) values(saved.id,entry->>'client_id',btrim(entry->>'code'));
 end loop;
 return to_jsonb(saved)||jsonb_build_object('client_codes',coalesce((select jsonb_agg(jsonb_build_object('client_id',c.client_id,'code',c.code) order by c.client_id,c.code) from public.product_client_codes c where c.product_id=saved.id),'[]'::jsonb));
end $$;
revoke all on function public.save_product_with_codes(jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_product_with_codes(jsonb,uuid,timestamptz) to authenticated;
commit;
