-- Orders received from customers. Writes are atomic and audited through save_purchase_order.
begin;
create table public.purchase_orders (
  id uuid primary key,
  business_id text not null references public.businesses(id) on delete restrict,
  client_id text not null references public.clients(id) on delete restrict,
  number text not null check (length(btrim(number)) between 1 and 100),
  kind text not null check (kind in ('parts','service')),
  status text not null check (status in ('draft','confirmed','cancelled')),
  fulfillment text not null check (fulfillment in ('pending','partial','complete')),
  order_date date not null,
  commitment_date date,
  completed_date date,
  currency text not null check (currency in ('MXN','USD','EUR')),
  notes text not null default '' check (length(notes) <= 4000),
  delivery_address text not null default '' check (length(delivery_address) <= 1000),
  cancellation_reason text not null default '' check (length(cancellation_reason) <= 1000),
  client_snapshot jsonb not null,
  business_snapshot jsonb not null,
  source jsonb,
  subtotal numeric(18,2) not null check (subtotal >= 0),
  tax numeric(18,2) not null check (tax >= 0),
  total numeric(18,2) not null check (total >= 0),
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((fulfillment = 'complete') = (completed_date is not null)),
  check (completed_date is null or completed_date >= order_date),
  check (commitment_date is null or commitment_date >= order_date),
  check (status <> 'draft' or fulfillment = 'pending'),
  check (status <> 'cancelled' or length(btrim(cancellation_reason)) > 0)
);
create unique index purchase_orders_number_unique on public.purchase_orders
  (business_id, client_id, lower(regexp_replace(btrim(number), '\s+', ' ', 'g')));
create index purchase_orders_business_created_idx on public.purchase_orders(business_id, created_at desc, id);
create index purchase_orders_client_idx on public.purchase_orders(client_id);
create index purchase_orders_created_by_idx on public.purchase_orders(created_by);
create index purchase_orders_updated_by_idx on public.purchase_orders(updated_by);

create table public.purchase_order_items (
  order_id uuid not null references public.purchase_orders(id) on delete restrict,
  position integer not null check (position > 0),
  code text not null default '' check (length(code) <= 100),
  description text not null check (length(btrim(description)) between 1 and 2000),
  unit text not null default '' check (length(unit) <= 30),
  quantity numeric(14,4) not null check (quantity > 0 and quantity <= 999999999),
  unit_price numeric(16,4) not null check (unit_price >= 0 and unit_price <= 999999999),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  amount numeric(18,2) not null check (amount >= 0),
  primary key(order_id, position)
);
create table public.purchase_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete restrict,
  revision integer not null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  snapshot jsonb not null,
  unique(order_id, revision)
);
create index purchase_order_events_actor_idx on public.purchase_order_events(actor_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_events enable row level security;
revoke all on public.purchase_orders, public.purchase_order_items, public.purchase_order_events from public, anon, authenticated;
grant select on public.purchase_orders, public.purchase_order_items, public.purchase_order_events to authenticated;
create policy orders_read on public.purchase_orders for select to authenticated using (
  exists (select 1 from public.app_admins where user_id = (select auth.uid()))
  or business_id in (select business_id from public.business_members where user_id = (select auth.uid()))
);
create policy order_items_read on public.purchase_order_items for select to authenticated using (
  order_id in (select id from public.purchase_orders)
);
create policy order_events_read on public.purchase_order_events for select to authenticated using (
  order_id in (select id from public.purchase_orders)
);

create function public.save_purchase_order(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing public.purchase_orders%rowtype;
  saved public.purchase_orders%rowtype;
  cid text;
  bid text;
  oid uuid;
  client_data jsonb;
  business_data jsonb;
  item jsonb;
  pos integer := 0;
  qty numeric;
  price numeric;
  disc numeric;
  line_total numeric;
  sub numeric := 0;
  vat numeric;
  expected integer;
  item_data jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'ORDER_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text) > 500000
    or jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception 'ORDER_INVALID';
  end if;
  if jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'ORDER_ITEMS'; end if;
  oid := (payload->>'id')::uuid;
  expected := (payload->>'revision')::integer;
  if oid is null or expected is null or expected < 0 then raise exception 'ORDER_INVALID'; end if;
  -- Serialize retries of the same client-generated identifier, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(oid::text, 0));
  select * into existing from public.purchase_orders where id = oid for update;
  if (existing.id is null and expected <> 0) or (existing.id is not null and existing.revision <> expected) then
    raise exception 'ORDER_CONFLICT';
  end if;
  if existing.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  bid := payload->>'business_id';
  cid := payload->>'client_id';
  if existing.id is not null and (bid is distinct from existing.business_id or cid is distinct from existing.client_id) then
    raise exception 'ORDER_IDENTITY';
  end if;
  if existing.id is null then
    select to_jsonb(c) - 'created_at' - 'updated_at' into client_data from public.clients c
      join public.business_clients bc on bc.client_id = c.id
      where bc.business_id = bid and c.id = cid and c.active for share of c, bc;
    select to_jsonb(b) - 'created_at' - 'updated_at' into business_data from public.businesses b
      where b.id = bid and b.active for share;
    if client_data is null or business_data is null then raise exception 'ORDER_CLIENT_NOT_ASSIGNED'; end if;
  else
    client_data := existing.client_snapshot;
    business_data := existing.business_snapshot;
  end if;
  if payload->>'status' = 'draft' and existing.status = 'confirmed' then raise exception 'ORDER_STATUS'; end if;
  if jsonb_typeof(payload->'source') not in ('object','null') or octet_length((payload->'source')::text) > 100000 then
    raise exception 'ORDER_SOURCE';
  end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
    pos := pos + 1;
    if coalesce(item->>'quantity','') !~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
      or coalesce(item->>'unit_price','') !~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
      or coalesce(item->>'discount','') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then
      raise exception 'ORDER_AMOUNT';
    end if;
    qty := (item->>'quantity')::numeric;
    price := (item->>'unit_price')::numeric;
    disc := (item->>'discount')::numeric;
    line_total := round(qty * price, 2) - disc;
    if qty <= 0 or price < 0 or disc < 0 or line_total < 0 then raise exception 'ORDER_AMOUNT'; end if;
    sub := sub + line_total;
    item_data := item_data || jsonb_build_array(jsonb_build_object(
      'position',pos,'code',btrim(coalesce(item->>'code','')),
      'description',btrim(item->>'description'),'unit',btrim(coalesce(item->>'unit','')),
      'quantity',qty,'unit_price',price,'discount',disc,'amount',line_total
    ));
  end loop;
  if coalesce(payload->>'tax','') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then raise exception 'ORDER_AMOUNT'; end if;
  vat := (payload->>'tax')::numeric;
  if existing.id is null then
    insert into public.purchase_orders(id,business_id,client_id,number,kind,status,fulfillment,order_date,
      commitment_date,completed_date,currency,notes,delivery_address,cancellation_reason,client_snapshot,
      business_snapshot,source,subtotal,tax,total,created_by,updated_by)
    values(oid,bid,cid,btrim(payload->>'number'),payload->>'kind',payload->>'status',payload->>'fulfillment',
      (payload->>'order_date')::date,nullif(payload->>'commitment_date','')::date,
      nullif(payload->>'completed_date','')::date,payload->>'currency',coalesce(payload->>'notes',''),
      coalesce(payload->>'delivery_address',''),coalesce(payload->>'cancellation_reason',''),client_data,
      business_data,nullif(payload->'source','null'::jsonb),sub,vat,sub+vat,auth.uid(),auth.uid());
  else
    update public.purchase_orders set number=btrim(payload->>'number'),kind=payload->>'kind',
      status=payload->>'status',fulfillment=payload->>'fulfillment',order_date=(payload->>'order_date')::date,
      commitment_date=nullif(payload->>'commitment_date','')::date,completed_date=nullif(payload->>'completed_date','')::date,
      currency=payload->>'currency',notes=coalesce(payload->>'notes',''),delivery_address=coalesce(payload->>'delivery_address',''),
      cancellation_reason=coalesce(payload->>'cancellation_reason',''),subtotal=sub,tax=vat,total=sub+vat,
      revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=oid;
    delete from public.purchase_order_items where order_id=oid;
  end if;
  insert into public.purchase_order_items(order_id,position,code,description,unit,quantity,unit_price,discount,amount)
    select oid,x.position,x.code,x.description,x.unit,x.quantity,x.unit_price,x.discount,x.amount
    from jsonb_to_recordset(item_data) as x(position integer,code text,description text,unit text,
      quantity numeric,unit_price numeric,discount numeric,amount numeric);
  select * into saved from public.purchase_orders where id=oid;
  insert into public.purchase_order_events(order_id,revision,action,actor_id,snapshot)
    values(oid,saved.revision,case when existing.id is null then 'created'
      when saved.status='cancelled' then 'cancelled' else 'updated' end,auth.uid(),
      jsonb_build_object('order',to_jsonb(saved),'items',item_data));
  return oid;
end;
$$;
revoke all on function public.save_purchase_order(jsonb) from public, anon, authenticated;
grant execute on function public.save_purchase_order(jsonb) to authenticated;
commit;

