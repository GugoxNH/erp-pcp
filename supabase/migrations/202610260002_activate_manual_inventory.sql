begin;
-- Activate the inventory portion only, preserving the newer user permission functions.
-- Fresh databases already created these objects in 202610250001.
do $migration$ begin
 if to_regclass('public.warehouse_adjustments') is null then
 execute $inventory$create table public.warehouse_adjustments (
 id uuid primary key, folio bigint generated always as identity unique,
 business_id text not null references public.businesses(id), product_id uuid not null references public.products(id), unit text not null,
 before_quantity numeric not null, after_quantity numeric not null check(after_quantity>=0),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),request jsonb not null
);
alter table public.warehouse_entries alter column receipt_id drop not null;
alter table public.warehouse_entries alter column line_id drop not null;
alter table public.warehouse_entries add column adjustment_id uuid references public.warehouse_adjustments(id);
alter table public.warehouse_entries add constraint warehouse_entry_origin check (
 (receipt_id is not null and line_id is not null and adjustment_id is null) or
 (receipt_id is null and line_id is null and item_id is null and adjustment_id is not null));
create table public.warehouse_adjustment_sources (
 adjustment_id uuid not null references public.warehouse_adjustments(id), entry_id uuid not null references public.warehouse_entries(id),
 quantity numeric(14,4) not null check(quantity>0), primary key(adjustment_id,entry_id)
);
create index warehouse_adjustment_sources_entry on public.warehouse_adjustment_sources(entry_id);
alter table public.warehouse_adjustments enable row level security;
alter table public.warehouse_adjustment_sources enable row level security;
revoke all on public.warehouse_adjustments,public.warehouse_adjustment_sources from public,anon,authenticated;
grant select on public.warehouse_adjustments,public.warehouse_adjustment_sources to authenticated;
create policy adjustments_read on public.warehouse_adjustments for select to authenticated using((select public.has_section('warehouse')));
create policy adjustment_sources_read on public.warehouse_adjustment_sources for select to authenticated using((select public.has_section('warehouse')));
create or replace function public.warehouse_entry_saldos(business text) returns table(id uuid,item_id uuid,product_id uuid,unit text,remaining numeric,date date,folio bigint)
language sql stable security definer set search_path='' as $$
 select e.id,e.item_id,e.product_id,e.unit,e.quantity
 -coalesce((select sum(d.quantity) from public.warehouse_dispatch_sources d where d.entry_id=e.id),0)
 -coalesce((select sum(a.quantity) from public.warehouse_adjustment_sources a where a.entry_id=e.id),0),
 coalesce(r.date,(a.created_at at time zone 'America/Mexico_City')::date),coalesce(r.folio,a.folio)
 from public.warehouse_entries e left join public.warehouse_receipts r on r.id=e.receipt_id
 left join public.warehouse_adjustments a on a.id=e.adjustment_id where coalesce(r.business_id,a.business_id)=business;
$$;
-- Include catalog products with zero stock so initial inventory can be captured.
create or replace function public.warehouse_balances(business text) returns table(product_id uuid,sku text,description text,unit text,quantity text,reserved text,available text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return query with balances as (
 select e.product_id,e.unit,sum(e.remaining) as quantity,
 coalesce(sum(e.remaining) filter(where e.item_id is not null),0) as reserved,
 coalesce(sum(e.remaining) filter(where e.item_id is null),0) as available
 from public.warehouse_entry_saldos(business) e group by e.product_id,e.unit
 ), all_rows as (
 select b.* from balances b union all
 select p.id,p.unit,0::numeric,0::numeric,0::numeric from public.products p where p.active and not exists(select 1 from balances b where b.product_id=p.id and b.unit=p.unit)
 ) select p.id,p.sku,p.name,b.unit,b.quantity::text,b.reserved::text,b.available::text from all_rows b join public.products p on p.id=b.product_id order by p.sku,b.unit;
end $$;
create function public.adjust_warehouse_stock(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; bid text; pid uuid; u text; desired numeric; expected numeric; current_qty numeric; reserved_qty numeric; delta numeric; needed numeric; take numeric; source record; previous public.warehouse_adjustments; product public.products;
begin
 if not public.has_section('warehouse') or not exists(select 1 from public.app_profiles where user_id=auth.uid() and active and (is_developer or edit_warehouse)) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>10000 then raise exception 'ADJUSTMENT_INVALID';end if;
 aid:=(payload->>'id')::uuid;bid:=payload->>'business_id';pid:=(payload->>'product_id')::uuid;u:=payload->>'unit';
 if aid is null or pid is null or bid is null or bid not in ('pcp','jose','taasa') or u is null or length(u) not between 1 and 30
 or coalesce(payload->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$'
 or coalesce(payload->>'expected','') !~ '^[0-9]{1,25}([.][0-9]{1,4})?$'
 or length(btrim(coalesce(payload->>'reason',''))) not between 1 and 1000 then raise exception 'ADJUSTMENT_INVALID';end if;
 desired:=(payload->>'quantity')::numeric;expected:=(payload->>'expected')::numeric;
 if desired>999999999 then raise exception 'ADJUSTMENT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||bid,0));
 select * into previous from public.warehouse_adjustments where id=aid;
 if found then
 if previous.request=payload and previous.actor_id=auth.uid() then return aid;end if;raise exception 'ADJUSTMENT_CONFLICT';end if;
 if not exists(select 1 from public.businesses where id=bid and active) then raise exception 'ADJUSTMENT_INVALID';end if;
 select * into product from public.products where id=pid;
 if not found then raise exception 'ADJUSTMENT_INVALID';end if;
 if u<>product.unit and not exists(select 1 from public.warehouse_entry_saldos(bid) e where e.product_id=pid and e.unit=u) then raise exception 'ADJUSTMENT_INVALID';end if;
 select coalesce(sum(e.remaining),0),coalesce(sum(e.remaining) filter(where e.item_id is not null),0) into current_qty,reserved_qty from public.warehouse_entry_saldos(bid) e where e.product_id=pid and e.unit=u;
 if current_qty<>expected then raise exception 'ADJUSTMENT_STALE';end if;
 if desired<reserved_qty then raise exception 'ADJUSTMENT_RESERVED';end if;
 delta:=desired-current_qty;
 if delta=0 then raise exception 'ADJUSTMENT_UNCHANGED';end if;
 insert into public.warehouse_adjustments(id,business_id,product_id,unit,before_quantity,after_quantity,reason,actor_id,request)
 values(aid,bid,pid,u,current_qty,desired,btrim(payload->>'reason'),auth.uid(),payload);
 if delta>0 then
 insert into public.warehouse_entries(adjustment_id,product_id,description,unit,destination,quantity) values(aid,pid,product.name,u,'Ajuste manual / stock disponible',delta);
 else
 needed:=-delta;
 for source in select * from public.warehouse_entry_saldos(bid) e where e.product_id=pid and e.unit=u and e.item_id is null and e.remaining>0 order by e.date,e.folio,e.id loop
 take:=least(needed,source.remaining);
 insert into public.warehouse_adjustment_sources(adjustment_id,entry_id,quantity) values(aid,source.id,take);
 needed:=needed-take;exit when needed=0;
 end loop;
 if needed>0 then raise exception 'ADJUSTMENT_RESERVED';end if;
 end if;
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 select auth.uid(),full_name,username,'warehouse.adjusted',aid::text,product.sku,bid,
 jsonb_build_object('description','Ajustó el stock de '||product.sku||' de '||current_qty||' a '||desired||' '||u||'. Motivo: '||btrim(payload->>'reason'),'before',current_qty,'after',desired,'reason',btrim(payload->>'reason')) from public.app_profiles where user_id=auth.uid();
 return aid;
end $$;
revoke all on function public.adjust_warehouse_stock(jsonb) from public,anon;
grant execute on function public.adjust_warehouse_stock(jsonb) to authenticated;
-- Preserve adjustment provenance when viewing outgoing shipments.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.warehouse_shipment_document(text,uuid)'::regprocedure);
 d:=replace(d,'join public.warehouse_receipts r on r.id=e.receipt_id','left join public.warehouse_receipts r on r.id=e.receipt_id left join public.warehouse_adjustments a on a.id=e.adjustment_id');
 d:=replace(d,$text$'receipt_folio',r.folio$text$,$text$'receipt_folio',r.folio,'adjustment_folio',a.folio$text$);
 d:=replace(d,$text$case when e.item_id is null then 'Stock libre'$text$,$text$case when e.adjustment_id is not null then 'Ajuste manual AJ-'||a.folio when e.item_id is null then 'Stock libre'$text$);
 execute d;
end $$;
$inventory$;
 end if;
end $migration$;
notify pgrst, 'reload schema';
commit;
