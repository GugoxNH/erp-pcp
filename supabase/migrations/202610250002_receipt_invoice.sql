begin;
-- Existing receipts retain their remision and have no invoice recorded.
alter table public.warehouse_receipts add column invoice text not null default '' check(length(invoice)<=100);

create or replace function public.receive_supplier_purchase(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid; bid text; p public.supplier_purchases%rowtype; previous public.warehouse_receipts%rowtype;
 entry jsonb; bucket record; qty numeric; receipt_date date; actor text;
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>500000 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'RECEIPT_INVALID';end if;
 if jsonb_array_length(payload->'items') not between 1 and 1000 then raise exception 'RECEIPT_INVALID';end if;
 rid:=(payload->>'id')::uuid;pid:=(payload->>'purchase_id')::uuid;bid:=payload->>'business_id';
 if rid is null or pid is null or bid is null or bid not in ('pcp','taasa','jose') then raise exception 'RECEIPT_INVALID';end if;
 if payload ? 'invoice' and jsonb_typeof(payload->'invoice') is distinct from 'string' then raise exception 'RECEIPT_INVALID';end if;
 if length(btrim(coalesce(payload->>'invoice','')))>100 then raise exception 'RECEIPT_INVALID';end if;
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
 insert into public.warehouse_receipts(id,business_id,purchase_id,date,reference,invoice,notes,actor_id,actor_name,request)
 values(rid,bid,pid,receipt_date,btrim(coalesce(payload->>'reference','')),btrim(coalesce(payload->>'invoice','')),btrim(coalesce(payload->>'notes','')),auth.uid(),actor,payload);
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

create or replace function public.warehouse_receipt_list(business text,page_number integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object('count',(select count(*) from public.warehouse_receipts where business_id=business),'rows',coalesce((select jsonb_agg(q order by q.folio desc) from (
 select r.id,r.folio,r.date::text,r.reference,r.invoice,r.notes,r.actor_name,r.created_at,p.number as purchase_number,p.supplier_name as supplier
 from public.warehouse_receipts r join public.supplier_purchases p on p.id=r.purchase_id where r.business_id=business order by r.folio desc limit 20 offset greatest(0,least(coalesce(page_number,0),1000000))*20) q),'[]'::jsonb));
end $$;

create or replace function public.warehouse_receipt_document(business text,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_section('warehouse') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select jsonb_build_object('id',r.id,'folio',r.folio,'date',r.date::text,'reference',r.reference,'invoice',r.invoice,'notes',r.notes,'actor_name',r.actor_name,'created_at',r.created_at,'purchase_number',p.number,'supplier',p.supplier_name,'items',
 (select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'unit',e.unit,'quantity',e.quantity::text,'destination',e.destination) order by l.position,e.destination) from public.warehouse_entries e join public.supplier_purchase_items l on l.id=e.line_id where e.receipt_id=r.id)) into result
 from public.warehouse_receipts r join public.supplier_purchases p on p.id=r.purchase_id where r.id=target and r.business_id=business;
 if result is null then raise exception 'RECEIPT_NOT_FOUND';end if;return result;
end $$;
commit;
