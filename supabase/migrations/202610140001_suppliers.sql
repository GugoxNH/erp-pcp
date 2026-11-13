begin;
alter table public.app_profiles drop constraint app_profiles_sections_check;
alter table public.app_profiles add constraint app_profiles_sections_check check(cardinality(sections) between 1 and 8 and sections <@ array['dashboard','businesses','clients','orders','products','users','audit','suppliers']::text[]);
update public.app_profiles set sections=array_append(sections,'suppliers') where is_developer and not ('suppliers'=any(sections));

create table public.suppliers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 200),
 legal_name text not null default '' check(length(legal_name)<=300),
 rfc text not null default '' check(rfc='' or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
 contact_name text not null default '' check(length(contact_name)<=160),
 email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=40),
 mobile text not null default '' check(length(mobile)<=40),
 address text not null default '' check(length(address)<=600),
 notes text not null default '' check(length(notes)<=2000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index suppliers_rfc_unique on public.suppliers(upper(btrim(rfc))) where btrim(rfc)<>'';
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon,authenticated;
grant select,insert,update,delete on public.suppliers to authenticated;
create policy suppliers_access on public.suppliers for all to authenticated using(public.has_section('suppliers')) with check(public.has_section('suppliers'));

create table public.product_suppliers (
 product_id uuid not null references public.products(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id) on delete restrict,
 primary key(product_id,supplier_id)
);
create index product_suppliers_supplier on public.product_suppliers(supplier_id);
alter table public.product_suppliers enable row level security;
revoke all on public.product_suppliers from anon,authenticated;
grant select on public.product_suppliers to authenticated;
create policy product_suppliers_read on public.product_suppliers for select to authenticated using(public.has_section('products'));

create function public.product_supplier_options() returns table(id uuid,name text,active boolean)
language sql stable security definer set search_path='' as $$
 select id,name,active from public.suppliers where public.has_section('products') order by name,id;
$$;
revoke all on function public.product_supplier_options() from public,anon;
grant execute on function public.product_supplier_options() to authenticated;

-- The existing function remains available to OC product creation, which has no suppliers yet.
create function public.save_product_catalog(payload jsonb,product_id uuid default null,expected_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved jsonb; supplier uuid; target uuid; begin
 if not public.has_section('products') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if jsonb_typeof(payload->'supplier_ids') is distinct from 'array' then raise exception 'INVALID_SUPPLIERS' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'supplier_ids') e where jsonb_typeof(e)<>'string') then raise exception 'INVALID_SUPPLIERS' using errcode='23514'; end if;
 saved:=public.save_product_with_codes(payload,product_id,expected_version);
 target:=(saved->>'id')::uuid;
 for supplier in select value::uuid from jsonb_array_elements_text(payload->'supplier_ids') order by value loop
  perform 1 from public.suppliers s where s.id=supplier and (s.active or exists(select 1 from public.product_suppliers ps where ps.product_id=target and ps.supplier_id=s.id)) for share;
  if not found then raise exception 'INVALID_SUPPLIER' using errcode='23514'; end if;
 end loop;
 delete from public.product_suppliers ps where ps.product_id=target;
 insert into public.product_suppliers(product_id,supplier_id) select target,value::uuid from jsonb_array_elements_text(payload->'supplier_ids');
 return saved||jsonb_build_object('supplier_ids',coalesce((select jsonb_agg(ps.supplier_id order by ps.supplier_id) from public.product_suppliers ps where ps.product_id=target),'[]'::jsonb));
end $$;
revoke all on function public.save_product_catalog(jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_product_catalog(jsonb,uuid,timestamptz) to authenticated;
commit;
