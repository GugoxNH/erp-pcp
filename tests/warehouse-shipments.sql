-- All fixtures and entries are rolled back; existing inventory is untouched.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
set local role authenticated;
do $$
declare cid text:='qa-receipts-'||gen_random_uuid(); oid uuid:=gen_random_uuid(); target uuid:=gen_random_uuid();
 pid uuid; sid uuid:=gen_random_uuid(); purchase uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); shipment uuid:=gen_random_uuid(); second_order uuid:=gen_random_uuid(); second_item uuid:=gen_random_uuid(); ship jsonb; second_oc jsonb;
 oc jsonb; payload jsonb; request jsonb; today text:=(now() at time zone 'America/Mexico_City')::date::text; result jsonb;
begin
 insert into public.clients(id,name) values(cid,cid);
 insert into public.business_clients(business_id,client_id) values('pcp',cid);
 insert into public.suppliers(id,name) values(sid,cid);
 perform public.resolve_order_product('pcp',cid,'QA-CODE',null,jsonb_build_object('sku',cid,'name','QA receiving product','unit','Pieza'));
 select product_id into pid from public.product_client_codes where client_id=cid and code='QA-CODE';
 oc:=jsonb_build_object('item_delivery_version',4,'id',oid,'revision',0,'business_id','pcp','client_id',cid,'number',cid,'status','confirmed','order_date',today,'currency','MXN','tax','0','source',null,'items',jsonb_build_array(jsonb_build_object('id',target,'kind','parts','code','QA-CODE','description','QA','unit','PZA','quantity','6','unit_price','10','discount','0','subitems','[]'::jsonb,'commitment_date',today,'fulfillment','pending','completed_date','')));
 perform public.save_purchase_order(oc);
 payload:=jsonb_build_object('id',purchase,'business_id','pcp','supplier_id',sid,'number',cid,'date',today,'expected_date','','currency','MXN','status','draft','notes','','tax','16','revision',0,'items',jsonb_build_array(jsonb_build_object('id',line,'product_id',pid,'quantity','10','unit_price','10','allocations',jsonb_build_array(jsonb_build_object('item_id',target,'quantity','4')))));
 perform public.save_product_catalog(to_jsonb(p)||jsonb_build_object('client_codes',jsonb_build_array(jsonb_build_object('client_id',cid,'code','QA-CODE')),'supplier_ids',jsonb_build_array(sid)),pid,p.updated_at) from public.products p where p.id=pid;
 perform public.save_supplier_purchase(payload);
 request:=jsonb_build_object('id',receipt,'business_id','pcp','purchase_id',purchase,'date',today,'reference','QA','notes','Partial receipt','items',jsonb_build_array(jsonb_build_object('line_id',line,'item_id',target,'quantity','2'),jsonb_build_object('line_id',line,'item_id',null,'quantity','3')));

 perform public.save_supplier_purchase(payload||'{"revision":1,"status":"ordered"}');
 request:=jsonb_set(jsonb_set(request,'{items,0,quantity}','"4"'),'{items,1,quantity}','"6"');
 perform public.receive_supplier_purchase(request);
 ship:=jsonb_build_object('id',shipment,'business_id','pcp','order_id',oid,'date',today,'reference','QA-SHIP','recipient','QA','notes','','items',jsonb_build_array(jsonb_build_object('item_id',target,'quantity','3')));
 -- Another OC cannot consume reserved stock belonging to the first one.
 second_oc:=jsonb_set(oc||jsonb_build_object('id',second_order,'number',cid||'-SECOND'),'{items,0,id}',to_jsonb(second_item::text));
 second_oc:=jsonb_set(second_oc,'{items,0,quantity}','"9"');
 perform public.save_purchase_order(second_oc);
 begin perform public.ship_customer_order(jsonb_set(ship||jsonb_build_object('order_id',second_order),'{items}',jsonb_build_array(jsonb_build_object('item_id',second_item,'quantity','7'))));raise exception 'Stole reserved stock';exception when raise_exception then if sqlerrm<>'SHIPMENT_STOCK' then raise;end if;end;
 begin perform public.ship_customer_order(ship||'{"business_id":"jose"}');raise exception 'Cross company accepted';exception when raise_exception then if sqlerrm<>'SHIPMENT_ORDER' then raise;end if;end;
 begin perform public.ship_customer_order(ship||'{"date":"2199-01-01"}');raise exception 'Future shipment';exception when raise_exception then if sqlerrm<>'SHIPMENT_DATE' then raise;end if;end;
 begin perform public.ship_customer_order(jsonb_set(ship,'{items,0,quantity}','"7"'));raise exception 'Overshipped OC';exception when raise_exception then if sqlerrm<>'SHIPMENT_EXCESS' then raise;end if;end;
 begin perform public.ship_customer_order(ship||jsonb_build_object('items',jsonb_build_array(ship->'items'->0,ship->'items'->0)));raise exception 'Duplicate accepted';exception when raise_exception then if sqlerrm<>'SHIPMENT_ITEM' then raise;end if;end;
 perform public.ship_customer_order(ship);
 perform public.ship_customer_order(ship);
 if (select count(*) from public.warehouse_shipments where order_id=oid)<>1 then raise exception 'Idempotency failed';end if;
 if not exists(select 1 from public.purchase_order_items where id=target and shipped_quantity=3 and fulfillment='partial' and completed_date is null) then raise exception 'Partial status incorrect';end if;
 if not exists(select 1 from public.purchase_orders where id=oid and revision=2 and fulfillment='partial') then raise exception 'Order revision/status missing';end if;
 if not exists(select 1 from public.warehouse_balances('pcp') where product_id=pid and quantity::numeric=7 and reserved::numeric=1 and available::numeric=6) then raise exception 'Reserved not consumed first';end if;
 if not exists(select 1 from jsonb_array_elements(public.purchase_options('pcp',null)->'targets') t where t->>'id'=target::text and (t->>'remaining')::numeric=2) then raise exception 'Partial purchasing demand missing';end if;
 result:=public.warehouse_shipment_document('pcp',shipment);
 if (result->'items'->0->'sources'->0->>'quantity')::numeric<>3 then raise exception 'Provenance missing';end if;
 begin perform public.save_purchase_order(oc||'{"revision":2}');raise exception 'Manual state overwrite';exception when raise_exception then if sqlerrm<>'ORDER_SHIPMENT_MANAGED' then raise;end if;end;
 oc:=jsonb_set(oc||'{"revision":2}','{items,0,fulfillment}','"partial"');
 perform public.save_purchase_order(oc);
 if not exists(select 1 from public.purchase_order_events where order_id=oid and revision=3 and (snapshot->'items'->0->>'shipped_quantity')::numeric=3) then raise exception 'Ordinary edit lost shipping history';end if;
 begin perform public.ship_customer_order(ship||'{"notes":"Changed"}');raise exception 'Different retry accepted';exception when raise_exception then if sqlerrm<>'SHIPMENT_CONFLICT' then raise;end if;end;
 perform public.ship_customer_order(ship||jsonb_build_object('id',gen_random_uuid()));
 if not exists(select 1 from public.purchase_order_items where id=target and shipped_quantity=6 and fulfillment='complete' and completed_date=today::date) then raise exception 'Complete state incorrect';end if;
 if not exists(select 1 from public.purchase_orders where id=oid and revision=4 and fulfillment='complete' and completed_date=today::date) then raise exception 'Complete order incorrect';end if;
 if not exists(select 1 from public.warehouse_balances('pcp') where product_id=pid and quantity::numeric=4 and reserved::numeric=0 and available::numeric=4) then raise exception 'Free stock incorrect';end if;
 if exists(select 1 from jsonb_array_elements(public.warehouse_shipping_options('pcp')) q where q->>'id'=oid::text) then raise exception 'Completed order offered';end if;
 if not exists(select 1 from public.activity_log where action='warehouse.shipped' and entity_id=shipment::text) then raise exception 'Audit missing';end if;
 -- Dispatching free stock satisfies demand that should no longer be purchased.
 perform public.ship_customer_order(ship||jsonb_build_object('id',gen_random_uuid(),'order_id',second_order,'items',jsonb_build_array(jsonb_build_object('item_id',second_item,'quantity','2'))));
 if not exists(select 1 from jsonb_array_elements(public.purchase_options('pcp',null)->'targets') t where t->>'id'=second_item::text and (t->>'remaining')::numeric=7) then raise exception 'Free-stock purchasing demand incorrect';end if;
 begin perform public.save_supplier_purchase(payload||jsonb_build_object('id',gen_random_uuid(),'revision',0,'number',cid||'-OVERBUY','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_id',pid,'quantity','8','unit_price','10','allocations',jsonb_build_array(jsonb_build_object('item_id',second_item,'quantity','8'))))));raise exception 'Repurchased already shipped demand';exception when raise_exception then if sqlerrm<>'PURCHASE_TARGET_EXCESS' then raise;end if;end;
 begin update public.warehouse_dispatch_sources set quantity=0;raise exception 'Direct mutation';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.ship_customer_order(ship);raise exception 'Unauthorized shipment';exception when insufficient_privilege then null;end;
 begin perform public.warehouse_shipping_options('pcp');raise exception 'Unauthorized options';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.warehouse_shipments) then raise exception 'RLS leak';end if;
end $$;
rollback;
