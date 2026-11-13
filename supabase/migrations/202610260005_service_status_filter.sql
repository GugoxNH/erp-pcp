begin;
create function public.service_catalog(business text, search_text text, page_number integer, status_filter text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_section('services') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if business is null or business not in ('pcp','taasa','jose') then raise exception 'SERVICE_BUSINESS'; end if;
 if status_filter is null or status_filter not in ('','pending','partial','complete') then raise exception 'SERVICE_FILTER'; end if;
 with matches as (
  select i.id,i.order_id,o.number as order_number,o.status as order_status,o.revision,i.position,
   coalesce(nullif(o.client_snapshot->>'legal_name',''),o.client_snapshot->>'name','') as client_name,
   i.description,i.quantity::text,i.unit,i.fulfillment,i.commitment_date::text,i.completed_date::text,o.created_at
  from public.purchase_order_items i join public.purchase_orders o on o.id=i.order_id
  where o.business_id=business and i.kind='service' and (status_filter='' or i.fulfillment=status_filter)
   and (coalesce(search_text,'')='' or strpos(lower(concat_ws(' ',i.description,o.number,o.client_snapshot->>'name',o.client_snapshot->>'legal_name')),lower(left(search_text,100)))>0)
 ), page_rows as (
  select * from matches order by created_at desc,order_id,position
  limit 25 offset greatest(0,least(coalesce(page_number,0),1000000))*25
 )
 select jsonb_build_object('count',(select count(*) from matches),'rows',coalesce(
  (select jsonb_agg(to_jsonb(p)-'created_at' order by p.created_at desc,p.order_id,p.position) from page_rows p),'[]'::jsonb)) into result;
 return result;
end $$;

revoke all on function public.service_catalog(text,text,integer,text) from public,anon;
grant execute on function public.service_catalog(text,text,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
