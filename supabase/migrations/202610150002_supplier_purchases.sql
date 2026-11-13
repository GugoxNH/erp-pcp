begin;
alter table public.app_profiles drop constraint app_profiles_sections_check;
alter table public.app_profiles add constraint app_profiles_sections_check check(cardinality(sections) between 1 and 9 and sections <@ array['dashboard','businesses','clients','orders','products','users','audit','suppliers','purchases']::text[]);
update public.app_profiles set sections=array_append(sections,'purchases') where is_developer and not ('purchases'=any(sections));
create table public.supplier_purchases (
 id uuid primary key, business_id text not null references public.businesses(id) on delete restrict,
 supplier_id uuid not null references public.suppliers(id) on delete restrict, supplier_name text not null,
 number text not null check(length(btrim(number)) between 1 and 100),
 date date not null check(date between date '1900-01-01' and date '2199-12-31'), expected_date date check(expected_date>=date and expected_date<=date '2199-12-31'),
 currency text not null check(currency in ('MXN','USD','EUR')), status text not null check(status in ('draft','ordered','cancelled')),
 notes text not null default '' check(length(notes)<=4000), cancellation_reason text not null default '' check(length(cancellation_reason)<=1000),
 tax numeric(18,2) not null check(tax>=0), subtotal numeric(18,2) not null check(subtotal>=0), total numeric(18,2) not null check(total>=0),
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'cancelled' or length(btrim(cancellation_reason))>0)
);
create unique index supplier_purchases_number on public.supplier_purchases(business_id,upper(btrim(number)));
create index supplier_purchases_supplier on public.supplier_purchases(supplier_id);
create table public.supplier_purchase_items (
 id uuid primary key, purchase_id uuid not null references public.supplier_purchases(id) on delete restrict,
 position integer not null check(position>0), product_id uuid not null references public.products(id) on delete restrict,
 description text not null, unit text not null,
 quantity numeric(14,4) not null check(quantity>0 and quantity<=999999999), unit_price numeric(16,4) not null check(unit_price>=0 and unit_price<=999999999),
 unique(purchase_id,position) deferrable initially immediate
);
create index supplier_purchase_items_product on public.supplier_purchase_items(product_id);
create table public.purchase_allocations (
 line_id uuid not null references public.supplier_purchase_items(id) on delete restrict,
 item_id uuid not null references public.purchase_order_items(id) on delete restrict,
 quantity numeric(14,4) not null check(quantity>0 and quantity<=999999999), primary key(line_id,item_id)
);
create index purchase_allocations_target on public.purchase_allocations(item_id);
create table public.supplier_purchase_events (
 id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.supplier_purchases(id) on delete restrict,
 revision integer not null, actor_id uuid references auth.users(id) on delete set null, actor_name text not null,
 occurred_at timestamptz not null default now(), snapshot jsonb not null, unique(purchase_id,revision)
);
create index supplier_purchase_events_actor on public.supplier_purchase_events(actor_id);
alter table public.supplier_purchases enable row level security;
alter table public.supplier_purchase_items enable row level security;
alter table public.purchase_allocations enable row level security;
alter table public.supplier_purchase_events enable row level security;
revoke all on public.supplier_purchases,public.supplier_purchase_items,public.purchase_allocations,public.supplier_purchase_events from public,anon,authenticated;
grant select on public.supplier_purchases,public.supplier_purchase_items,public.purchase_allocations,public.supplier_purchase_events to authenticated;
create policy purchases_read on public.supplier_purchases for select to authenticated using((select public.has_section('purchases')));
create policy purchase_items_read on public.supplier_purchase_items for select to authenticated using((select public.has_section('purchases')));
create policy allocations_read on public.purchase_allocations for select to authenticated using((select public.has_section('purchases')));
create policy purchase_events_read on public.supplier_purchase_events for select to authenticated using((select public.has_section('purchases')));

create function public.purchase_unit(value text) returns text language sql immutable set search_path='' as $$
 select case lower(btrim(value)) when 'pza' then 'pieza' when 'pzas' then 'pieza' when 'piezas' then 'pieza' when 'pz' then 'pieza' when 'kg' then 'kilogramo' when 'm' then 'metro' when 'lt' then 'litro' else lower(btrim(value)) end;
$$;
revoke all on function public.purchase_unit(text) from public,anon,authenticated;

create function public.purchase_options(business text, excluded_purchase uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object(
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.suppliers where active),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'unit',p.unit,'supplier_ids',coalesce((select jsonb_agg(s.supplier_id) from public.product_suppliers s where s.product_id=p.id),'[]'::jsonb)) order by p.sku,p.id) from public.products p where active),'[]'::jsonb),
 'targets',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'order_id',o.id,'number',o.number,'client',o.client_snapshot->>'name','position',i.position,'product_id',i.product_id,'description',i.description,'unit',i.unit,'remaining',(i.quantity-coalesce((select sum(a.quantity) from public.purchase_allocations a join public.supplier_purchase_items l on l.id=a.line_id join public.supplier_purchases p on p.id=l.purchase_id where a.item_id=i.id and p.status<>'cancelled' and p.id is distinct from excluded_purchase),0))::text) order by o.number,i.position) from public.purchase_order_items i join public.purchase_orders o on o.id=i.order_id where o.business_id=business and o.status='confirmed' and i.kind='parts' and i.product_id is not null and i.fulfillment='pending'),'[]'::jsonb));
end $$;
revoke all on function public.purchase_options(text,uuid) from public,anon;
grant execute on function public.purchase_options(text,uuid) to authenticated;

create function public.save_supplier_purchase(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid; bid text; existing public.supplier_purchases%rowtype; supplier public.suppliers%rowtype;
 item jsonb; allocation jsonb; product public.products%rowtype; target public.purchase_order_items%rowtype;
 line uuid; ids uuid[]:='{}'; targets uuid[]:='{}'; total_quantity numeric; qty numeric; price numeric; assigned numeric; sub numeric:=0; vat numeric; pos integer:=0; actor text;
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>500000 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'PURCHASE_INVALID';end if;
 if jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'PURCHASE_INVALID';end if;
 pid:=(payload->>'id')::uuid;bid:=payload->>'business_id';
 if pid is null or bid not in ('pcp','taasa','jose') or bid is null then raise exception 'PURCHASE_INVALID';end if;
 -- Serialize purchase allocation changes per company, then lock customer orders before their items.
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||bid,0));
 if not exists(select 1 from public.businesses where id=bid and active) then raise exception 'PURCHASE_INVALID';end if;
 select * into existing from public.supplier_purchases where id=pid for update;
 if existing.id is not null and existing.business_id<>bid then raise exception 'PURCHASE_INVALID';end if;
 if (payload->>'revision')::integer is distinct from coalesce(existing.revision,0) then raise exception 'PURCHASE_CONFLICT';end if;
 if existing.id is not null and existing.status<>'draft' then raise exception 'PURCHASE_FINAL';end if;
 if coalesce(payload->>'status','') not in ('draft','ordered') then raise exception 'PURCHASE_INVALID';end if;
 select * into supplier from public.suppliers where id=(payload->>'supplier_id')::uuid and active for share;
 if not found then raise exception 'PURCHASE_SUPPLIER';end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
  if jsonb_typeof(item->'allocations') is distinct from 'array' or jsonb_array_length(item->'allocations')>200 then raise exception 'PURCHASE_INVALID';end if;
  for allocation in select value from jsonb_array_elements(item->'allocations') loop
   if nullif(allocation->>'item_id','') is null then raise exception 'PURCHASE_TARGET';end if;
   targets:=array_append(targets,(allocation->>'item_id')::uuid);
  end loop;
 end loop;
 perform 1 from public.purchase_orders o where o.id in(select i.order_id from public.purchase_order_items i where i.id=any(targets)) order by o.id for update;
 perform 1 from public.purchase_order_items where id=any(targets) order by id for update;
 -- Validate totals and identity before replacing editable draft assignments.
 for item in select value from jsonb_array_elements(payload->'items') loop
  line:=(item->>'id')::uuid;
  if line is null or line=any(ids) or exists(select 1 from public.supplier_purchase_items where id=line and purchase_id<>pid) then raise exception 'PURCHASE_INVALID';end if;
  ids:=array_append(ids,line);
  if coalesce(item->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$' or coalesce(item->>'unit_price','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$' then raise exception 'PURCHASE_AMOUNT';end if;
  qty:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
  if qty<=0 then raise exception 'PURCHASE_AMOUNT';end if;
  sub:=sub+round(qty*price,2);
 end loop;
 if coalesce(payload->>'tax','') !~ '^[0-9]{1,9}([.][0-9]{1,2})?$' then raise exception 'PURCHASE_AMOUNT';end if;vat:=(payload->>'tax')::numeric;
 if existing.id is null then
  insert into public.supplier_purchases(id,business_id,supplier_id,supplier_name,number,date,expected_date,currency,status,notes,tax,subtotal,total)
   values(pid,bid,supplier.id,supplier.name,btrim(payload->>'number'),(payload->>'date')::date,nullif(payload->>'expected_date','')::date,payload->>'currency',payload->>'status',coalesce(payload->>'notes',''),vat,sub,sub+vat);
 else
  update public.supplier_purchases set supplier_id=supplier.id,supplier_name=supplier.name,number=btrim(payload->>'number'),date=(payload->>'date')::date,expected_date=nullif(payload->>'expected_date','')::date,currency=payload->>'currency',status=payload->>'status',notes=coalesce(payload->>'notes',''),tax=vat,subtotal=sub,total=sub+vat,revision=revision+1,updated_at=now() where id=pid;
 end if;
 delete from public.purchase_allocations where line_id in(select id from public.supplier_purchase_items where purchase_id=pid);
 delete from public.supplier_purchase_items where purchase_id=pid and not(id=any(ids));
 set constraints public.supplier_purchase_items_purchase_id_position_key deferred;
 for item in select value from jsonb_array_elements(payload->'items') loop
  pos:=pos+1;line:=(item->>'id')::uuid;qty:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
  select * into product from public.products where id=(item->>'product_id')::uuid and active for share;
  if not found then raise exception 'PURCHASE_PRODUCT';end if;
  insert into public.supplier_purchase_items(id,purchase_id,position,product_id,description,unit,quantity,unit_price)
   values(line,pid,pos,product.id,product.name,product.unit,qty,price)
   on conflict(id) do update set position=excluded.position,product_id=excluded.product_id,description=excluded.description,unit=excluded.unit,quantity=excluded.quantity,unit_price=excluded.unit_price where public.supplier_purchase_items.purchase_id=pid;
  if exists(select 1 from public.supplier_purchase_items where id=line and purchase_id<>pid) then raise exception 'PURCHASE_INVALID';end if;
  assigned:=0;
  for allocation in select value from jsonb_array_elements(item->'allocations') loop
   if coalesce(allocation->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$' or (allocation->>'quantity')::numeric<=0 then raise exception 'PURCHASE_AMOUNT';end if;
   select i.* into target from public.purchase_order_items i join public.purchase_orders o on o.id=i.order_id where i.id=(allocation->>'item_id')::uuid and o.business_id=bid and o.status='confirmed' and i.kind='parts' and i.fulfillment='pending';
   if not found or target.product_id is distinct from product.id then raise exception 'PURCHASE_TARGET';end if;
   if public.purchase_unit(target.unit)<>public.purchase_unit(product.unit) then raise exception 'PURCHASE_UNIT';end if;
   assigned:=assigned+(allocation->>'quantity')::numeric;
   if assigned>qty then raise exception 'PURCHASE_EXCESS';end if;
   select coalesce(sum(a.quantity),0) into total_quantity from public.purchase_allocations a join public.supplier_purchase_items l on l.id=a.line_id join public.supplier_purchases p on p.id=l.purchase_id where a.item_id=target.id and p.status<>'cancelled';
   if total_quantity+(allocation->>'quantity')::numeric>target.quantity then raise exception 'PURCHASE_TARGET_EXCESS';end if;
   insert into public.purchase_allocations(line_id,item_id,quantity) values(line,target.id,(allocation->>'quantity')::numeric);
   update public.purchase_order_items set operations_locked_at=coalesce(operations_locked_at,now()) where id=target.id;
  end loop;
 end loop;
 set constraints public.supplier_purchase_items_purchase_id_position_key immediate;
 select full_name||' (@'||username||')' into actor from public.app_profiles where user_id=auth.uid();
 insert into public.supplier_purchase_events(purchase_id,revision,actor_id,actor_name,snapshot)
 select pid,p.revision,auth.uid(),actor,jsonb_build_object('purchase',to_jsonb(p),'items',(select jsonb_agg(to_jsonb(l)||jsonb_build_object('allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.purchase_allocations a where a.line_id=l.id),'[]'::jsonb)) order by l.position) from public.supplier_purchase_items l where l.purchase_id=pid)) from public.supplier_purchases p where id=pid;
 return pid;
end $$;
revoke all on function public.save_supplier_purchase(jsonb) from public,anon;
grant execute on function public.save_supplier_purchase(jsonb) to authenticated;

create function public.cancel_supplier_purchase(target uuid,business text,expected integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.supplier_purchases%rowtype; actor text;
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if length(btrim(coalesce(reason,''))) not between 1 and 1000 then raise exception 'PURCHASE_REASON';end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||business,0));
 select * into p from public.supplier_purchases where id=target and business_id=business for update;
 if not found or p.revision is distinct from expected then raise exception 'PURCHASE_CONFLICT';end if;
 if p.status='cancelled' then raise exception 'PURCHASE_FINAL';end if;
 update public.supplier_purchases set status='cancelled',cancellation_reason=btrim(reason),revision=revision+1,updated_at=now() where id=target returning * into p;
 select full_name||' (@'||username||')' into actor from public.app_profiles where user_id=auth.uid();
 insert into public.supplier_purchase_events(purchase_id,revision,actor_id,actor_name,snapshot) values(target,p.revision,auth.uid(),actor,jsonb_build_object('purchase',to_jsonb(p)));
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 select auth.uid(),full_name,username,'supplier_purchase.cancelled',p.id::text,p.number,p.business_id,
 jsonb_build_object('description','Canceló la compra '||p.number||' del proveedor '||p.supplier_name||'. Motivo: '||btrim(reason))
 from public.app_profiles where user_id=auth.uid();
 -- Keep allocations as evidence. Cancelled purchases no longer consume planned demand.
end $$;
revoke all on function public.cancel_supplier_purchase(uuid,text,integer,text) from public,anon;
grant execute on function public.cancel_supplier_purchase(uuid,text,integer,text) to authenticated;

create function public.order_purchase_assignments(business text,customer_order uuid) returns table(item_id uuid,"position" integer,purchase_number text,supplier text,status text,quantity text,unit text)
language sql stable security definer set search_path='' as $$
 select i.id,i.position,p.number,p.supplier_name,p.status,a.quantity::text,l.unit from public.purchase_order_items i join public.purchase_orders o on o.id=i.order_id join public.purchase_allocations a on a.item_id=i.id join public.supplier_purchase_items l on l.id=a.line_id join public.supplier_purchases p on p.id=l.purchase_id
 where public.has_section('orders') and o.id=customer_order and o.business_id=business order by i.position,p.number;
$$;
revoke all on function public.order_purchase_assignments(text,uuid) from public,anon;
grant execute on function public.order_purchase_assignments(text,uuid) to authenticated;
create function public.supplier_purchase_document(business text,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select to_jsonb(p)||jsonb_build_object('date',p.date::text,'expected_date',coalesce(p.expected_date::text,''),'tax',p.tax::text,'total',p.total::text,'subtotal',p.subtotal::text,
 'items',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity',l.quantity::text,'unit_price',l.unit_price::text,'allocations',coalesce((select jsonb_agg(jsonb_build_object('item_id',a.item_id,'quantity',a.quantity::text,'label',o.number||' · '||(o.client_snapshot->>'name')||' · Partida '||i.position)) from public.purchase_allocations a join public.purchase_order_items i on i.id=a.item_id join public.purchase_orders o on o.id=i.order_id where a.line_id=l.id),'[]'::jsonb)) order by l.position) from public.supplier_purchase_items l where l.purchase_id=p.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e order by e.revision desc) from (select revision,actor_name,occurred_at,snapshot->'purchase'->>'status' as status from public.supplier_purchase_events where purchase_id=p.id order by revision desc limit 50) e),'[]'::jsonb)) into result from public.supplier_purchases p where p.id=target and p.business_id=business;
 if result is null then raise exception 'PURCHASE_NOT_FOUND';end if;
 return result;
end $$;
revoke all on function public.supplier_purchase_document(text,uuid) from public,anon;
grant execute on function public.supplier_purchase_document(text,uuid) to authenticated;
commit;
