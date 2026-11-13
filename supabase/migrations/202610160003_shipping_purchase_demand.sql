begin;
create function public.order_unplanned_shipped(target uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(d.quantity),0) from public.warehouse_dispatch_sources d
 join public.warehouse_shipment_items s on s.id=d.shipment_item_id join public.warehouse_entries e on e.id=d.entry_id
 where s.item_id=target and e.item_id is null;
$$;
revoke all on function public.order_unplanned_shipped(uuid) from public,anon,authenticated;
-- Partial shipments must not hide outstanding purchasing demand. Material sent from
-- free stock already satisfies demand and must not be purchased again for that OC.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.purchase_options(text,uuid)'::regprocedure);
 if position('i.quantity-coalesce(' in definition)=0 or position('i.fulfillment=''pending''' in definition)=0 then raise exception 'Unexpected purchase_options definition';end if;
 definition:=replace(definition,'i.quantity-coalesce(','i.quantity-public.order_unplanned_shipped(i.id)-coalesce(');
 execute replace(definition,'i.fulfillment=''pending''','i.fulfillment in (''pending'',''partial'')');
 definition:=pg_get_functiondef('public.save_supplier_purchase(jsonb)'::regprocedure);
 if position('>target.quantity then' in definition)=0 or position('i.fulfillment=''pending''' in definition)=0 then raise exception 'Unexpected save_supplier_purchase definition';end if;
 definition:=replace(definition,'>target.quantity then','>target.quantity-public.order_unplanned_shipped(target.id) then');
 execute replace(definition,'i.fulfillment=''pending''','i.fulfillment in (''pending'',''partial'')');
end $$;
commit;
