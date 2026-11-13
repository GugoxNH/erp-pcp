begin;
alter table public.product_suppliers add column code text not null default '' check(length(code)<=80);
create or replace function public.save_product_catalog(payload jsonb,product_id uuid default null,expected_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved jsonb; supplier uuid; target uuid; codes jsonb; begin
 if not public.has_section('products') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if jsonb_typeof(payload->'supplier_ids') is distinct from 'array' then raise exception 'INVALID_SUPPLIERS' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'supplier_ids') e where jsonb_typeof(e)<>'string') then raise exception 'INVALID_SUPPLIERS' using errcode='23514'; end if;
 if payload ? 'supplier_codes' and jsonb_typeof(payload->'supplier_codes') is distinct from 'object' then raise exception 'INVALID_SUPPLIER_CODES' using errcode='23514'; end if;
 if exists(select 1 from jsonb_each(coalesce(payload->'supplier_codes','{}'::jsonb)) e where jsonb_typeof(e.value)<>'string' or length(btrim(e.value #>> '{}'))>80) then raise exception 'INVALID_SUPPLIER_CODES' using errcode='23514'; end if;
 saved:=public.save_product_with_codes(payload,product_id,expected_version);
 target:=(saved->>'id')::uuid;
 for supplier in select value::uuid from jsonb_array_elements_text(payload->'supplier_ids') order by value loop
  perform 1 from public.suppliers s where s.id=supplier and (s.active or exists(select 1 from public.product_suppliers ps where ps.product_id=target and ps.supplier_id=s.id)) for share;
  if not found then raise exception 'INVALID_SUPPLIER' using errcode='23514'; end if;
 end loop;
 -- Older clients omit codes: preserve existing values instead of clearing them.
 codes:=coalesce(payload->'supplier_codes',(select jsonb_object_agg(ps.supplier_id,ps.code) from public.product_suppliers ps where ps.product_id=target),'{}'::jsonb);
 delete from public.product_suppliers ps where ps.product_id=target;
 insert into public.product_suppliers(product_id,supplier_id,code) select target,value::uuid,btrim(coalesce(codes->>value,'')) from jsonb_array_elements_text(payload->'supplier_ids');
 return saved||jsonb_build_object('supplier_codes',coalesce((select jsonb_object_agg(ps.supplier_id,ps.code) from public.product_suppliers ps where ps.product_id=target),'{}'::jsonb),'supplier_ids',coalesce((select jsonb_agg(ps.supplier_id order by ps.supplier_id) from public.product_suppliers ps where ps.product_id=target),'[]'::jsonb));
end $$;

commit;
