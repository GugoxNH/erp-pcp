-- Integration tests use the existing administrator identity and roll back ALL fixtures.
begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.app_admins limit 1), true);
set local role authenticated;
do $$
declare
  cid text := 'qa-orders-' || gen_random_uuid()::text;
  oid uuid := gen_random_uuid();
  payload jsonb;
  version integer;
  amount numeric;
  rejected boolean;
begin
  insert into public.clients(id,name) values(cid,cid);
  insert into public.business_clients(business_id,client_id) values('pcp',cid);
  perform public.resolve_order_product('pcp',cid,'SUB',null,jsonb_build_object('sku',cid,'name','QA part','unit','Pieza'));
  payload := jsonb_build_object(
    'item_delivery_version',4,'id',oid,'revision',0,'business_id','pcp','client_id',cid,'number','QA-001','kind','parts',
    'status','draft','fulfillment','pending','order_date','2026-10-07','commitment_date','2026-10-08',
    'completed_date','','currency','MXN','tax','0.30','notes','','source',null,
    'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'subitems',jsonb_build_array(jsonb_build_object('code','SUB','description','Detail','quantity','1','unit','PZA','unit_price','2','amount','2')),'kind','parts','code','','description','Test part','unit','PZA',
      'commitment_date','2026-10-06','fulfillment','pending','completed_date','','quantity','1','unit_price','2.005','discount','0.01'))
  );
  perform public.save_purchase_order(payload);
  rejected:=false;
  begin
    perform public.delete_purchase_order(oid,'pcp',1,'eliminar');
  exception when raise_exception then
    if sqlerrm<>'ORDER_CONFIRMATION' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Confirmation not enforced'; end if;
  rejected:=false;
  begin
    perform public.delete_purchase_order(oid,'pcp',9,'ELIMINAR');
  exception when raise_exception then
    if sqlerrm<>'ORDER_CONFLICT' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Stale deletion accepted'; end if;
  if not exists(select 1 from public.purchase_orders where id=oid) then raise exception 'Failed confirmation deleted data'; end if;
  perform public.delete_purchase_order(oid,'pcp',1,'ELIMINAR');
  if exists(select 1 from public.purchase_orders where id=oid)
     or exists(select 1 from public.purchase_order_items where order_id=oid)
     or exists(select 1 from public.purchase_order_events where order_id=oid) then raise exception 'Order not fully deleted'; end if;
  if (select count(*) from public.activity_log where entity_id=oid::text and actor_id=auth.uid() and actor_username<>'' and action='purchase_order.deleted')<>1 then raise exception 'Missing audit record'; end if;
  if has_table_privilege('authenticated','public.activity_log','delete')
    or has_table_privilege('authenticated','public.activity_log','update')
    or has_table_privilege('authenticated','public.activity_log','insert')
    or has_function_privilege('anon','public.delete_purchase_order(uuid,text,integer,text)','execute') then raise exception 'Unsafe audit privileges'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.activity_log) then raise exception 'Audit leaked'; end if;
  rejected:=false;
  begin
    perform public.delete_purchase_order(oid,'pcp',1,'ELIMINAR');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Unauthorized deletion allowed'; end if;
end;
$$;
rollback;
