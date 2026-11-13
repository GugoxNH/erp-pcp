begin;
-- Older shipments retain their remision; invoice remains empty.
alter table public.warehouse_shipments add column invoice text not null default '' check(length(invoice)<=100);
-- warehouse_shipment_document already returns to_jsonb(s), including invoice.

create or replace function public.ship_customer_order(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; oid uuid; bid text; o public.purchase_orders%rowtype; previous public.warehouse_shipments%rowtype;
 target public.purchase_order_items%rowtype; part jsonb; source record; qty numeric; needed numeric; take numeric; rowid uuid;
 shipping_date date; actor text; seen uuid[]:='{}'; sent numeric; last_date date; item_data jsonb;
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>500000 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'SHIPMENT_INVALID';end if;
 if jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'SHIPMENT_INVALID';end if;
 sid:=(payload->>'id')::uuid;oid:=(payload->>'order_id')::uuid;bid:=payload->>'business_id';
 if sid is null or oid is null or bid is null or bid not in ('pcp','jose','taasa') then raise exception 'SHIPMENT_INVALID';end if;
 if payload ? 'invoice' and jsonb_typeof(payload->'invoice') is distinct from 'string' then raise exception 'SHIPMENT_INVALID';end if;
 if length(btrim(coalesce(payload->>'invoice','')))>100 then raise exception 'SHIPMENT_INVALID';end if;
 -- Same company lock as purchases and receipts, followed by the customer order lock.
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||bid,0));
 select * into previous from public.warehouse_shipments where id=sid;
 if found then
  if previous.request=payload and previous.actor_id=auth.uid() then return sid;end if;raise exception 'SHIPMENT_CONFLICT';
 end if;
 select * into o from public.purchase_orders where id=oid and business_id=bid for update;
 if not found or o.status<>'confirmed' then raise exception 'SHIPMENT_ORDER';end if;
 if not exists(select 1 from public.businesses where id=bid and active) then raise exception 'SHIPMENT_INVALID';end if;
 shipping_date:=(payload->>'date')::date;
 if shipping_date is null or shipping_date<o.order_date or shipping_date>(now() at time zone 'America/Mexico_City')::date then raise exception 'SHIPMENT_DATE';end if;
 perform 1 from public.purchase_order_items where order_id=oid order by id for update;
 select full_name||' (@'||username||')' into actor from public.app_profiles where user_id=auth.uid();
 insert into public.warehouse_shipments(id,business_id,order_id,order_number,client_name,delivery_address,date,reference,invoice,recipient,notes,actor_id,actor_name,request)
 values(sid,bid,oid,o.number,coalesce(o.client_snapshot->>'name',''),o.delivery_address,shipping_date,btrim(coalesce(payload->>'reference','')),btrim(coalesce(payload->>'invoice','')),btrim(coalesce(payload->>'recipient','')),btrim(coalesce(payload->>'notes','')),auth.uid(),actor,payload);
 for part in select value from jsonb_array_elements(payload->'items') loop
  if coalesce(part->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$' then raise exception 'SHIPMENT_AMOUNT';end if;
  qty:=(part->>'quantity')::numeric;if qty<=0 then raise exception 'SHIPMENT_AMOUNT';end if;
  select * into target from public.purchase_order_items where id=(part->>'item_id')::uuid and order_id=oid and kind='parts' and product_id is not null;
  if not found or target.id=any(seen) then raise exception 'SHIPMENT_ITEM';end if;seen:=array_append(seen,target.id);
  if target.shipped_quantity=0 and target.fulfillment<>'pending' then raise exception 'SHIPMENT_LEGACY';end if;
  if qty>target.quantity-target.shipped_quantity then raise exception 'SHIPMENT_EXCESS';end if;
  insert into public.warehouse_shipment_items(shipment_id,item_id,product_id,position,description,unit,quantity)
   values(sid,target.id,target.product_id,target.position,target.description,target.unit,qty) returning id into rowid;
  needed:=qty;
  for source in select * from public.warehouse_entry_saldos(bid) e where e.product_id=target.product_id
    and public.purchase_unit(e.unit)=public.purchase_unit(target.unit) and (e.item_id=target.id or e.item_id is null) and e.remaining>0 and e.date<=shipping_date
    order by (e.item_id is not null) desc,e.date,e.folio,e.id loop
   take:=least(needed,source.remaining);
   insert into public.warehouse_dispatch_sources(shipment_item_id,entry_id,quantity) values(rowid,source.id,take);
   needed:=needed-take;exit when needed=0;
  end loop;
  if needed>0 then raise exception 'SHIPMENT_STOCK';end if;
  select sum(i.quantity),max(s.date) into sent,last_date from public.warehouse_shipment_items i join public.warehouse_shipments s on s.id=i.shipment_id where i.item_id=target.id;
  update public.purchase_order_items set shipped_quantity=sent,operations_locked_at=coalesce(operations_locked_at,now()),
   fulfillment=case when sent=quantity then 'complete' else 'partial' end,completed_date=case when sent=quantity then last_date else null end where id=target.id;
 end loop;
 update public.purchase_orders set fulfillment=x.fulfillment,commitment_date=x.commitment_date,completed_date=x.completed_date,revision=revision+1,updated_at=now(),updated_by=auth.uid()
 from (select case when bool_and(fulfillment='complete') then 'complete' when bool_and(fulfillment='pending') then 'pending' else 'partial' end as fulfillment,
 min(commitment_date) filter(where fulfillment<>'complete') as commitment_date,case when bool_and(fulfillment='complete') then max(completed_date) else null end as completed_date
 from public.purchase_order_items where order_id=oid) x where id=oid returning public.purchase_orders.* into o;
 select jsonb_agg(to_jsonb(i) order by i.position) into item_data from public.purchase_order_items i where order_id=oid;
 insert into public.purchase_order_events(order_id,revision,action,actor_id,snapshot) values(oid,o.revision,'updated',auth.uid(),jsonb_build_object('order',to_jsonb(o),'items',item_data,'shipment_id',sid));
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 select auth.uid(),full_name,username,'warehouse.shipped',sid::text,o.number,bid,jsonb_build_object('description','Registró la salida de almacén para la OC '||o.number||' del cliente '||coalesce(o.client_snapshot->>'name',''),'shipment_id',sid) from public.app_profiles where user_id=auth.uid();
 return sid;
end $$;

create or replace function public.warehouse_shipment_list(business text,page_number integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object('count',(select count(*) from public.warehouse_shipments where business_id=business),'rows',coalesce((select jsonb_agg(q order by q.folio desc) from (
 select id,folio,date::text,order_number,client_name,reference,invoice,recipient,actor_name,created_at,delivery_address,notes from public.warehouse_shipments where business_id=business order by folio desc limit 20 offset greatest(0,least(coalesce(page_number,0),1000000))*20) q),'[]'::jsonb));
end $$;
commit;
