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
  select total,revision into amount,version from public.purchase_orders where id=oid;
  if (select code from public.purchase_order_items where order_id=oid and position=1)<>'SUB'
    or (select jsonb_array_length(subitems) from public.purchase_order_items where order_id=oid and position=1)<>1 then raise exception 'Subitems lost'; end if;
  if amount <> 2.30 or version <> 1 then raise exception 'Totals/revision failed'; end if;
  rejected := false;
  begin
    perform public.save_purchase_order(jsonb_set(payload || jsonb_build_object('id',gen_random_uuid()),'{items,0,id}',to_jsonb(gen_random_uuid())));
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'Duplicate number accepted'; end if;
  rejected := false;
  begin
    perform public.save_purchase_order(payload);
  exception when raise_exception then
    if sqlerrm <> 'ORDER_CONFLICT' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Stale revision accepted'; end if;
  payload := payload || '{"revision":1,"status":"confirmed"}'::jsonb;
  perform public.save_purchase_order(payload);
  rejected := false;
  begin
    perform public.save_purchase_order(jsonb_set(payload || '{"revision":2}'::jsonb,
      '{items,0,description}', '""'::jsonb));
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Invalid item accepted'; end if;
  if (select revision from public.purchase_orders where id=oid) <> 2
    or (select count(*) from public.purchase_order_items where order_id=oid) <> 1
    or (select count(*) from public.purchase_order_events where order_id=oid) <> 2
    then raise exception 'Transaction rollback failed'; end if;
  payload := jsonb_set(payload,'{items}',(payload->'items') || jsonb_build_array((payload->'items'->0) || jsonb_build_object('id',gen_random_uuid()) || '{"kind":"service","commitment_date":"2026-10-12","fulfillment":"complete","completed_date":"2026-10-08"}'::jsonb));
  perform public.save_purchase_order(payload || '{"revision":2,"fulfillment":"complete","commitment_date":"2099-01-01"}'::jsonb);
  if (select kind from public.purchase_orders where id=oid)<>'mixed'
    or (select kind from public.purchase_order_items where order_id=oid and position=2)<>'service'
    or (select fulfillment from public.purchase_orders where id=oid)<>'partial'
    or (select commitment_date from public.purchase_orders where id=oid)<>date '2026-10-06'
    or (select count(*) from public.purchase_order_items where order_id=oid)<>2 then raise exception 'Per-item summary failed'; end if;
  rejected := false;
  begin
    perform public.save_purchase_order((payload - 'item_delivery_version') || '{"revision":3}'::jsonb);
  exception when raise_exception then
    if sqlerrm<>'ORDER_RELOAD_REQUIRED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Legacy payload accepted'; end if;
  rejected := false;
  begin
    perform public.save_purchase_order(jsonb_set(payload || '{"revision":3}'::jsonb,'{items,1,completed_date}','""'::jsonb));
  exception when raise_exception then
    if sqlerrm<>'ORDER_ITEM_DELIVERY' then raise; end if;
    rejected := true;
  end;
  if not rejected or (select revision from public.purchase_orders where id=oid)<>3 then raise exception 'Invalid delivery rollback failed'; end if;
  delete from public.business_clients where business_id='pcp' and client_id=cid;
  perform public.save_purchase_order(payload || '{"revision":3}'::jsonb);
  rejected := false;
  begin
    perform public.save_purchase_order(payload || jsonb_build_object('id',gen_random_uuid(),'revision',0,'number','QA-002'));
  exception when raise_exception then
    if sqlerrm <> 'ORDER_CLIENT_NOT_ASSIGNED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Unassigned client accepted'; end if;
  perform public.save_purchase_order(payload || '{"revision":4,"status":"cancelled","cancellation_reason":"QA rollback"}'::jsonb);
  rejected := false;
  begin
    perform public.save_purchase_order(payload || '{"revision":5}'::jsonb);
  exception when raise_exception then
    if sqlerrm <> 'ORDER_CANCELLED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Cancelled order editable'; end if;
  if has_table_privilege('authenticated','public.purchase_orders','insert')
    or has_table_privilege('authenticated','public.purchase_order_events','update')
    or has_function_privilege('anon','public.save_purchase_order(jsonb)','execute')
    then raise exception 'Unsafe permissions'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.purchase_orders where id=oid) then raise exception 'RLS read leaked'; end if;
  rejected := false;
  begin
    perform public.save_purchase_order(payload || jsonb_build_object('id',gen_random_uuid()));
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Non-admin RPC allowed'; end if;
end;
$$;
rollback;

