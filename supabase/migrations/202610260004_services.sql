begin;
alter table public.app_profiles drop constraint app_profiles_sections_check;
alter table public.app_profiles add constraint app_profiles_sections_check check (
 cardinality(sections) between 1 and 11 and sections <@ array['dashboard','businesses','clients','orders','services','products','users','audit','suppliers','purchases','warehouse']::text[]
);

-- The OC item is the service record: existing and new services appear without duplication.
-- Return only the fields needed by the catalog, without broadening OC read policies.
create function public.service_catalog(business text, search_text text default '', page_number integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_section('services') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if business is null or business not in ('pcp','taasa','jose') then raise exception 'SERVICE_BUSINESS'; end if;
 with matches as (
  select i.id,i.order_id,o.number as order_number,o.status as order_status,o.revision,i.position,
   coalesce(nullif(o.client_snapshot->>'legal_name',''),o.client_snapshot->>'name','') as client_name,
   i.description,i.quantity::text,i.unit,i.fulfillment,i.commitment_date::text,i.completed_date::text,o.created_at
  from public.purchase_order_items i join public.purchase_orders o on o.id=i.order_id
  where o.business_id=business and i.kind='service'
   and (coalesce(search_text,'')='' or strpos(lower(concat_ws(' ',i.description,o.number,o.client_snapshot->>'name',o.client_snapshot->>'legal_name')),lower(left(search_text,100)))>0)
 ), page_rows as (
  select * from matches order by created_at desc,order_id,position
  limit 25 offset greatest(0,least(coalesce(page_number,0),1000000))*25
 )
 select jsonb_build_object('count',(select count(*) from matches),'rows',coalesce(
  (select jsonb_agg(to_jsonb(p)-'created_at' order by p.created_at desc,p.order_id,p.position) from page_rows p),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.complete_order_service(business text,target uuid,expected integer)
returns date language plpgsql security definer set search_path='' as $$
declare oid uuid; o public.purchase_orders; item public.purchase_order_items;
 today date := (now() at time zone 'America/Mexico_City')::date;
begin
 if not public.has_section('services') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select i.order_id into oid from public.purchase_order_items i join public.purchase_orders p on p.id=i.order_id
 where i.id=target and i.kind='service' and p.business_id=business;
 if oid is null then raise exception 'SERVICE_NOT_FOUND'; end if;
 -- Same ordering/lock as OC saves and deletes. Shipments also lock the order row first.
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into o from public.purchase_orders where id=oid and business_id=business for update;
 if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
 select * into item from public.purchase_order_items where id=target and order_id=oid and kind='service' for update;
 if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
 if o.status<>'confirmed' then raise exception 'SERVICE_STATUS'; end if;
 -- A retry must preserve the original date and avoid duplicate history/log entries.
 if item.fulfillment='complete' then return item.completed_date; end if;
 if expected is null or o.revision is distinct from expected then raise exception 'SERVICE_CONFLICT'; end if;
 if today<o.order_date then raise exception 'SERVICE_DATE'; end if;
 update public.purchase_order_items set fulfillment='complete',completed_date=today where id=target;
 -- Preserve commitment_date on the service; recompute only the OC summary.
 update public.purchase_orders set fulfillment=x.fulfillment,commitment_date=x.commitment_date,
 completed_date=x.completed_date,revision=revision+1,updated_at=now(),updated_by=auth.uid()
 from (select case when bool_and(fulfillment='complete') then 'complete' when bool_and(fulfillment='pending') then 'pending' else 'partial' end as fulfillment,
 min(commitment_date) filter(where fulfillment<>'complete') as commitment_date,
 case when bool_and(fulfillment='complete') then max(completed_date) else null end as completed_date
 from public.purchase_order_items where order_id=oid) x where id=oid returning public.purchase_orders.* into o;
 insert into public.purchase_order_events(order_id,revision,action,actor_id,snapshot)
 values(oid,o.revision,'updated',auth.uid(),jsonb_build_object('order',to_jsonb(o),'items',
 (select jsonb_agg(to_jsonb(i) order by i.position) from public.purchase_order_items i where order_id=oid),'service_item_id',target));
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 select auth.uid(),full_name,username,'service.completed',target::text,o.number,business,
 jsonb_build_object('description','Completó el servicio '||item.description||' de la OC '||o.number,
 'order_id',oid,'item_id',target,'completed_date',today,'commitment_date',item.commitment_date)
 from public.app_profiles where user_id=auth.uid();
 return today;
end $$;
revoke all on function public.service_catalog(text,text,integer),public.complete_order_service(text,uuid,integer) from public,anon;
grant execute on function public.service_catalog(text,text,integer),public.complete_order_service(text,uuid,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
