begin;
lock table public.purchase_orders,public.purchase_order_items in share row exclusive mode;
alter table public.purchase_order_items add column id uuid not null default gen_random_uuid();
alter table public.purchase_order_items add column operations_locked_at timestamptz;
alter table public.purchase_order_items drop constraint purchase_order_items_pkey;
alter table public.purchase_order_items add primary key(id);
alter table public.purchase_order_items add constraint purchase_order_items_order_position_key unique(order_id,position) deferrable initially immediate;

-- Only trusted operational routines may set this marker. The OC payload cannot write it.
create function public.guard_order_item_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.order_id<>old.order_id) then raise exception 'ORDER_ITEM_ID'; end if;
 if old.operations_locked_at is not null then
  if tg_op='DELETE' then raise exception 'ORDER_ITEM_LOCKED'; end if;
  if new.operations_locked_at is distinct from old.operations_locked_at or
    row(new.product_id,new.kind,new.code,new.unit,new.quantity,new.subitems) is distinct from
    row(old.product_id,old.kind,old.code,old.unit,old.quantity,old.subitems) then raise exception 'ORDER_ITEM_LOCKED'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.guard_order_item_identity() from public,anon,authenticated;
create trigger order_item_identity before update or delete on public.purchase_order_items for each row execute function public.guard_order_item_identity();

-- Preserve historical snapshots as written; establish the first identity-aware baseline.
update public.purchase_orders set revision=revision+1,updated_at=now();
insert into public.purchase_order_events(order_id,revision,action,snapshot)
 select o.id,o.revision,'identity_migrated',jsonb_build_object('order',to_jsonb(o),'items',
 coalesce((select jsonb_agg(to_jsonb(i)-'order_id' order by i.position) from public.purchase_order_items i where i.order_id=o.id),'[]'::jsonb))
 from public.purchase_orders o;
create or replace function public.save_purchase_order(payload jsonb)
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
  linked_product uuid;
  item_id uuid;
  seen_ids uuid[] := '{}';
  prior_item public.purchase_order_items%rowtype;
  child jsonb;
  field text;
  child_codes text[];
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
  if not public.has_section('orders') then
    raise exception 'ORDER_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text) > 500000
    or jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception 'ORDER_INVALID';
  end if;
  if payload->>'item_delivery_version' is distinct from '4' then raise exception 'ORDER_RELOAD_REQUIRED'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'ORDER_ITEMS'; end if;
  if btrim(coalesce(payload->>'number',''))='' or coalesce(payload->>'order_date','')='' then raise exception 'ORDER_REQUIRED_FIELDS'; end if;
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
    if coalesce(item->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'ORDER_ITEM_ID'; end if;
    item_id := (item->>'id')::uuid;
    if item_id=any(seen_ids) then raise exception 'ORDER_ITEM_ID'; end if;
    seen_ids:=array_append(seen_ids,item_id);
    select * into prior_item from public.purchase_order_items where id=item_id for update;
    if prior_item.id is not null and prior_item.order_id<>oid then raise exception 'ORDER_ITEM_ID'; end if;
    if jsonb_typeof(item->'subitems') is distinct from 'array' then raise exception 'ORDER_SUBITEMS'; end if;
    if jsonb_array_length(item->'subitems')>200 then raise exception 'ORDER_SUBITEMS'; end if;
    for child in select value from jsonb_array_elements(item->'subitems') loop
      foreach field in array array['code','description','unit','quantity','unit_price','amount'] loop
        if jsonb_typeof(child->field) is distinct from 'string' then raise exception 'ORDER_SUBITEMS'; end if;
      end loop;
      if length(child->>'code')>100 or length(child->>'unit')>30 or length(btrim(child->>'description')) not between 1 and 2000 then raise exception 'ORDER_SUBITEMS'; end if;
      foreach field in array array['quantity','unit_price','amount'] loop
        if child->>field<>'' then
          if (field='amount' and child->>field !~ '^[0-9]{1,16}([.][0-9]{1,2})?$')
            or (field<>'amount' and child->>field !~ '^[0-9]{1,9}([.][0-9]{1,4})?$') then raise exception 'ORDER_SUBITEMS'; end if;
          if field='quantity' and (child->>field)::numeric<=0 then raise exception 'ORDER_SUBITEMS'; end if;
        end if;
      end loop;
    end loop;
    if btrim(coalesce(item->>'code',''))='' then
      select array_agg(distinct btrim(value->>'code')) filter(where btrim(value->>'code')<>'') into child_codes from jsonb_array_elements(item->'subitems');
      if cardinality(child_codes)=1 then item:=jsonb_set(item,'{code}',to_jsonb(child_codes[1])); end if;
    end if;
    if coalesce(item->>'kind','') not in ('parts','service') then raise exception 'ORDER_ITEM_KIND'; end if;
    if coalesce(item->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$'
      or coalesce(item->>'unit_price','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$'
      or coalesce(item->>'discount','') !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' then
      raise exception 'ORDER_AMOUNT';
    end if;
    if jsonb_typeof(item->'commitment_date') is distinct from 'string'
      or jsonb_typeof(item->'completed_date') is distinct from 'string'
      or coalesce(item->>'fulfillment','') not in ('pending','partial','complete') then raise exception 'ORDER_ITEM_DELIVERY'; end if;
    if (item->>'commitment_date'<>'' and (item->>'commitment_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (item->>'commitment_date')::date not between date '1900-01-01' and date '2199-12-31'))
      or (item->>'completed_date'<>'' and (item->>'completed_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (item->>'completed_date')::date not between date '1900-01-01' and date '2199-12-31')) then raise exception 'ORDER_ITEM_DATE'; end if;
    if ((item->>'fulfillment'='complete') is distinct from (item->>'completed_date'<>''))
      or (nullif(item->>'completed_date','')::date < (payload->>'order_date')::date)
      or (payload->>'status'='draft' and item->>'fulfillment'<>'pending') then raise exception 'ORDER_ITEM_DELIVERY'; end if;
    if coalesce(item->>'commitment_date','')='' then raise exception 'ORDER_REQUIRED_FIELDS'; end if;
    linked_product:=null;
    if item->>'kind'='parts' then
      if length(btrim(coalesce(item->>'code',''))) not between 1 and 80 then raise exception 'ORDER_PRODUCT_REQUIRED'; end if;
      select p.id into linked_product from public.products p join public.product_client_codes c on c.product_id=p.id
        where p.active and c.client_id=cid and upper(btrim(c.code))=upper(btrim(item->>'code')) for share of p,c;
      if linked_product is null then raise exception 'ORDER_PRODUCT_REQUIRED'; end if;
    end if;
    qty := (item->>'quantity')::numeric;
    price := (item->>'unit_price')::numeric;
    disc := (item->>'discount')::numeric;
    line_total := round(qty * price, 2) - disc;
    if qty <= 0 or price < 0 or disc < 0 or line_total < 0 then raise exception 'ORDER_AMOUNT'; end if;
    sub := sub + line_total;
    item_data := item_data || jsonb_build_array(jsonb_build_object(
      'id',item_id,'product_id',linked_product,'subitems',item->'subitems','kind',item->>'kind','position',pos,'code',btrim(coalesce(item->>'code','')),
      'description',btrim(item->>'description'),'unit',btrim(coalesce(item->>'unit','')),
      'quantity',qty,'unit_price',price,'discount',disc,'amount',line_total,
      'commitment_date',nullif(item->>'commitment_date','')::date,
      'fulfillment',item->>'fulfillment','completed_date',nullif(item->>'completed_date','')::date
    ));
  end loop;
  if coalesce(payload->>'tax','') !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' then raise exception 'ORDER_AMOUNT'; end if;
  vat := (payload->>'tax')::numeric;
  -- Header fields are derived summaries, never client-controlled delivery values.
  select payload || jsonb_build_object(
    'kind',case when bool_and(x.kind='parts') then 'parts' when bool_and(x.kind='service') then 'service' else 'mixed' end,
    'fulfillment',case when bool_and(x.fulfillment='complete') then 'complete' when bool_and(x.fulfillment='pending') then 'pending' else 'partial' end,
    'commitment_date',min(x.commitment_date) filter(where x.fulfillment<>'complete'),
    'completed_date',case when bool_and(x.fulfillment='complete') then max(x.completed_date) else null end)
    into payload from jsonb_to_recordset(item_data) as x(kind text,commitment_date date,fulfillment text,completed_date date);
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

  end if;
  if payload->>'status'='cancelled' and exists(select 1 from public.purchase_order_items where order_id=oid and operations_locked_at is not null) then raise exception 'ORDER_ITEM_LOCKED'; end if;
  -- Positions may move; identity and operational foreign keys must not.
  set constraints public.purchase_order_items_order_position_key deferred;
  delete from public.purchase_order_items where order_id=oid and not(id=any(seen_ids));
  insert into public.purchase_order_items(id,order_id,product_id,subitems,kind,position,code,description,unit,quantity,unit_price,discount,amount,commitment_date,fulfillment,completed_date)
    select x.id,oid,x.product_id,x.subitems,x.kind,x.position,x.code,x.description,x.unit,x.quantity,x.unit_price,x.discount,x.amount,x.commitment_date,x.fulfillment,x.completed_date
    from jsonb_to_recordset(item_data) as x(id uuid,product_id uuid,subitems jsonb,kind text,position integer,code text,description text,unit text,
      quantity numeric,unit_price numeric,discount numeric,amount numeric,commitment_date date,fulfillment text,completed_date date)
    on conflict (id) do update set
      position=excluded.position,product_id=excluded.product_id,subitems=excluded.subitems,kind=excluded.kind,
      code=excluded.code,description=excluded.description,unit=excluded.unit,quantity=excluded.quantity,
      unit_price=excluded.unit_price,discount=excluded.discount,amount=excluded.amount,
      commitment_date=excluded.commitment_date,fulfillment=excluded.fulfillment,completed_date=excluded.completed_date
    where public.purchase_order_items.order_id=excluded.order_id;
  if exists(select 1 from public.purchase_order_items where id=any(seen_ids) and order_id<>oid) then raise exception 'ORDER_ITEM_ID'; end if;
  set constraints public.purchase_order_items_order_position_key immediate;
  select * into saved from public.purchase_orders where id=oid;
  insert into public.purchase_order_events(order_id,revision,action,actor_id,snapshot)
    values(oid,saved.revision,case when existing.id is null then 'created'
      when saved.status='cancelled' then 'cancelled' else 'updated' end,auth.uid(),
      jsonb_build_object('order',to_jsonb(saved),'items',item_data));
  return oid;
end;
$$;

revoke all on function public.save_purchase_order(jsonb) from public,anon;
grant execute on function public.save_purchase_order(jsonb) to authenticated;
commit;

