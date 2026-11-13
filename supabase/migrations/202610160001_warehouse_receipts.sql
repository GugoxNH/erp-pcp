begin;
alter table public.app_profiles drop constraint app_profiles_sections_check;
alter table public.app_profiles add constraint app_profiles_sections_check check(cardinality(sections) between 1 and 10 and sections <@ array['dashboard','businesses','clients','orders','products','users','audit','suppliers','purchases','warehouse']::text[]);
update public.app_profiles set sections=array_append(sections,'warehouse') where is_developer and not('warehouse'=any(sections));

create table public.warehouse_receipts (
 id uuid primary key, folio bigint generated always as identity unique,
 business_id text not null references public.businesses(id), purchase_id uuid not null references public.supplier_purchases(id),
 date date not null, reference text not null check(length(reference)<=100), notes text not null check(length(notes)<=4000),
 actor_id uuid references auth.users(id) on delete set null, actor_name text not null,
 created_at timestamptz not null default now(), request jsonb not null
);
create index warehouse_receipts_purchase on public.warehouse_receipts(purchase_id);
create index warehouse_receipts_business on public.warehouse_receipts(business_id,folio desc);
-- Each immutable receipt line is the physical warehouse entry, with its planned destination.
create table public.warehouse_entries (
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.warehouse_receipts(id),
 line_id uuid not null references public.supplier_purchase_items(id), item_id uuid references public.purchase_order_items(id),
 product_id uuid not null references public.products(id), description text not null, unit text not null, destination text not null,
 quantity numeric(14,4) not null check(quantity>0 and quantity<=999999999),
 unique nulls not distinct(receipt_id,line_id,item_id)
);
create index warehouse_entries_line on public.warehouse_entries(line_id,item_id);
create index warehouse_entries_item on public.warehouse_entries(item_id);
create index warehouse_entries_product on public.warehouse_entries(product_id);
alter table public.warehouse_receipts enable row level security;
alter table public.warehouse_entries enable row level security;
revoke all on public.warehouse_receipts,public.warehouse_entries from public,anon,authenticated;
grant select on public.warehouse_receipts,public.warehouse_entries to authenticated;
create policy receipts_read on public.warehouse_receipts for select to authenticated using((select public.has_section('warehouse')));
create policy entries_read on public.warehouse_entries for select to authenticated using((select public.has_section('warehouse')));

create function public.guard_received_purchase() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status and exists(select 1 from public.warehouse_receipts where purchase_id=old.id) then
  raise exception 'PURCHASE_RECEIVED';
 end if;
 return new;
end $$;
create trigger guard_received_purchase before update on public.supplier_purchases for each row execute function public.guard_received_purchase();
revoke all on function public.guard_received_purchase() from public,anon,authenticated;

create function public.receipt_buckets(target uuid) returns table(line_id uuid,item_id uuid,"position" integer,description text,unit text,destination text,planned numeric,received numeric,remaining numeric)
language sql stable security definer set search_path='' as $$
 with buckets as (
  select l.id as line_id,a.item_id,l.position,l.description,l.unit,
   o.number||' · '||coalesce(o.client_snapshot->>'name','')||' · Partida '||i.position as destination,a.quantity as planned
  from public.supplier_purchase_items l join public.purchase_allocations a on a.line_id=l.id
  join public.purchase_order_items i on i.id=a.item_id join public.purchase_orders o on o.id=i.order_id where l.purchase_id=target
  union all
  select l.id,null,l.position,l.description,l.unit,'Stock disponible',l.quantity-coalesce((select sum(a.quantity) from public.purchase_allocations a where a.line_id=l.id),0)
  from public.supplier_purchase_items l where l.purchase_id=target
 ), quantities as (
  select b.*,coalesce((select sum(e.quantity) from public.warehouse_entries e where e.line_id=b.line_id and e.item_id is not distinct from b.item_id),0) as received
  from buckets b where b.planned>0
 ) select q.line_id,q.item_id,q.position,q.description,q.unit,q.destination,q.planned,q.received,q.planned-q.received from quantities q order by q.position,q.destination;
$$;
revoke all on function public.receipt_buckets(uuid) from public,anon,authenticated;

create function public.warehouse_purchase_options(business text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'number',p.number,'supplier',p.supplier_name,'date',p.date::text,'buckets',
  (select jsonb_agg(jsonb_build_object('line_id',b.line_id,'item_id',b.item_id,'position',b.position,'description',b.description,'unit',b.unit,'destination',b.destination,'planned',b.planned::text,'received',b.received::text,'remaining',b.remaining::text) order by b.position,b.destination) from public.receipt_buckets(p.id) b)) order by p.created_at desc,p.id)
 from public.supplier_purchases p where p.business_id=business and p.status='ordered' and exists(select 1 from public.receipt_buckets(p.id) b where b.remaining>0)),'[]'::jsonb);
end $$;
revoke all on function public.warehouse_purchase_options(text) from public,anon;
grant execute on function public.warehouse_purchase_options(text) to authenticated;

create function public.receive_supplier_purchase(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid; bid text; p public.supplier_purchases%rowtype; previous public.warehouse_receipts%rowtype;
 entry jsonb; bucket record; qty numeric; receipt_date date; actor text;
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>500000 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'RECEIPT_INVALID';end if;
 if jsonb_array_length(payload->'items') not between 1 and 1000 then raise exception 'RECEIPT_INVALID';end if;
 rid:=(payload->>'id')::uuid;pid:=(payload->>'purchase_id')::uuid;bid:=payload->>'business_id';
 if rid is null or pid is null or bid is null or bid not in ('pcp','taasa','jose') then raise exception 'RECEIPT_INVALID';end if;
 -- Shared lock order with purchase edits/cancellation prevents receiving a cancelled purchase.
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||bid,0));
 select * into previous from public.warehouse_receipts where id=rid;
 if found then
  if previous.request=payload and previous.actor_id=auth.uid() then return rid;end if;
  raise exception 'RECEIPT_CONFLICT';
 end if;
 select * into p from public.supplier_purchases where id=pid and business_id=bid for update;
 if not found or p.status<>'ordered' then raise exception 'RECEIPT_PURCHASE';end if;
 if not exists(select 1 from public.businesses where id=bid and active) then raise exception 'RECEIPT_INVALID';end if;
 receipt_date:=(payload->>'date')::date;
 if receipt_date is null or receipt_date<p.date or receipt_date>(now() at time zone 'America/Mexico_City')::date then raise exception 'RECEIPT_DATE';end if;
 select full_name||' (@'||username||')' into actor from public.app_profiles where user_id=auth.uid();
 insert into public.warehouse_receipts(id,business_id,purchase_id,date,reference,notes,actor_id,actor_name,request)
 values(rid,bid,pid,receipt_date,btrim(coalesce(payload->>'reference','')),btrim(coalesce(payload->>'notes','')),auth.uid(),actor,payload);
 for entry in select value from jsonb_array_elements(payload->'items') loop
  if coalesce(entry->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$' then raise exception 'RECEIPT_AMOUNT';end if;
  qty:=(entry->>'quantity')::numeric;
  if qty<=0 then raise exception 'RECEIPT_AMOUNT';end if;
  select * into bucket from public.receipt_buckets(pid) b where b.line_id=(entry->>'line_id')::uuid and b.item_id is not distinct from (entry->>'item_id')::uuid;
  if not found then raise exception 'RECEIPT_DESTINATION';end if;
  if qty>bucket.remaining then raise exception 'RECEIPT_EXCESS';end if;
  insert into public.warehouse_entries(receipt_id,line_id,item_id,product_id,description,unit,destination,quantity)
  select rid,l.id,bucket.item_id,l.product_id,l.description,l.unit,bucket.destination,qty from public.supplier_purchase_items l where l.id=bucket.line_id;
 end loop;
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 select auth.uid(),full_name,username,'warehouse.received',rid::text,p.number,bid,
 jsonb_build_object('description','Registró la entrada de almacén de la compra '||p.number||' del proveedor '||p.supplier_name,'receipt_id',rid) from public.app_profiles where user_id=auth.uid();
 return rid;
end $$;
revoke all on function public.receive_supplier_purchase(jsonb) from public,anon;
grant execute on function public.receive_supplier_purchase(jsonb) to authenticated;

create function public.warehouse_receipt_list(business text,page_number integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object('count',(select count(*) from public.warehouse_receipts where business_id=business),'rows',coalesce((select jsonb_agg(q order by q.folio desc) from (
 select r.id,r.folio,r.date::text,r.reference,r.notes,r.actor_name,r.created_at,p.number as purchase_number,p.supplier_name as supplier
 from public.warehouse_receipts r join public.supplier_purchases p on p.id=r.purchase_id where r.business_id=business order by r.folio desc limit 20 offset greatest(0,least(coalesce(page_number,0),1000000))*20) q),'[]'::jsonb));
end $$;
revoke all on function public.warehouse_receipt_list(text,integer) from public,anon;
grant execute on function public.warehouse_receipt_list(text,integer) to authenticated;

create function public.warehouse_receipt_document(business text,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select jsonb_build_object('id',r.id,'folio',r.folio,'date',r.date::text,'reference',r.reference,'notes',r.notes,'actor_name',r.actor_name,'created_at',r.created_at,'purchase_number',p.number,'supplier',p.supplier_name,'items',
 (select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'unit',e.unit,'quantity',e.quantity::text,'destination',e.destination) order by l.position,e.destination) from public.warehouse_entries e join public.supplier_purchase_items l on l.id=e.line_id where e.receipt_id=r.id)) into result
 from public.warehouse_receipts r join public.supplier_purchases p on p.id=r.purchase_id where r.id=target and r.business_id=business;
 if result is null then raise exception 'RECEIPT_NOT_FOUND';end if;return result;
end $$;
revoke all on function public.warehouse_receipt_document(text,uuid) from public,anon;
grant execute on function public.warehouse_receipt_document(text,uuid) to authenticated;

create function public.warehouse_balances(business text) returns table(product_id uuid,sku text,description text,unit text,quantity text,reserved text,available text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return query select e.product_id,p.sku,p.name,e.unit,sum(e.quantity)::text,
 coalesce(sum(e.quantity) filter(where e.item_id is not null),0)::text,coalesce(sum(e.quantity) filter(where e.item_id is null),0)::text
 from public.warehouse_entries e join public.warehouse_receipts r on r.id=e.receipt_id join public.products p on p.id=e.product_id
 where r.business_id=business group by e.product_id,p.sku,p.name,e.unit order by p.sku,e.unit;
end $$;
revoke all on function public.warehouse_balances(text) from public,anon;
grant execute on function public.warehouse_balances(text) to authenticated;
commit;
