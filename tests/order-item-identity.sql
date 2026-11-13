begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
do $$
declare cid text:='qa-identity-'||gen_random_uuid(); oid uuid:=gen_random_uuid(); other_oid uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); payload jsonb; item jsonb; version integer; rejected boolean;
begin
 insert into public.clients(id,name) values(cid,cid);
 insert into public.business_clients(business_id,client_id) values('pcp',cid);
 item:=jsonb_build_object('id',a,'kind','service','code','','description','A','unit','PZA','quantity','1','unit_price','10','discount','0','subitems','[]'::jsonb,'commitment_date','2026-10-16','fulfillment','pending','completed_date','');
 payload:=jsonb_build_object('item_delivery_version',4,'id',oid,'revision',0,'business_id','pcp','client_id',cid,'number',cid,'status','confirmed','order_date','2026-10-15','currency','MXN','tax','0','source',null,'items',jsonb_build_array(item,item||jsonb_build_object('id',b,'description','B')));
 perform public.save_purchase_order(payload);
 -- Delete A: B keeps its identity while moving from position 2 to 1. Add C.
 payload:=payload||jsonb_build_object('revision',1,'items',jsonb_build_array(item||jsonb_build_object('id',b,'description','B edited'),item||jsonb_build_object('id',c,'description','C')));
 perform public.save_purchase_order(payload);
 if exists(select 1 from public.purchase_order_items where id=a) or not exists(select 1 from public.purchase_order_items where id=b and position=1 and description='B edited') then raise exception 'Identity lost';end if;
 payload:=payload||jsonb_build_object('revision',2,'items',jsonb_build_array(payload->'items'->1,payload->'items'->0));
 perform public.save_purchase_order(payload);
 if not exists(select 1 from public.purchase_order_items where id=b and position=2) then raise exception 'Reorder failed';end if;
 payload:=payload||'{"revision":3}'::jsonb;
 begin perform public.save_purchase_order(payload||jsonb_build_object('items',jsonb_build_array(item||jsonb_build_object('id',b),item||jsonb_build_object('id',b))));raise exception 'Duplicate accepted';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_ID' then raise;end if;end;
 begin perform public.save_purchase_order(payload||jsonb_build_object('id',other_oid,'revision',0,'number',cid||'-2'));raise exception 'Foreign ID accepted';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_ID' then raise;end if;end;
 begin perform public.save_purchase_order(payload||'{"item_delivery_version":3}'::jsonb);raise exception 'Legacy accepted';exception when raise_exception then if sqlerrm<>'ORDER_RELOAD_REQUIRED' then raise;end if;end;
 -- Simulate the marker that a trusted future operational routine must set.
 update public.purchase_order_items set operations_locked_at=now() where id=b;
 begin perform public.save_purchase_order(jsonb_set(payload,'{items,1,quantity}','"2"'));raise exception 'Locked quantity changed';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_LOCKED' then raise;end if;end;
 begin perform public.save_purchase_order(payload||jsonb_build_object('items',jsonb_build_array(payload->'items'->0)));raise exception 'Locked item deleted';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_LOCKED' then raise;end if;end;
 begin perform public.save_purchase_order(payload||'{"status":"cancelled","cancellation_reason":"QA"}'::jsonb);raise exception 'Locked order cancelled';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_LOCKED' then raise;end if;end;
 begin perform public.delete_purchase_order(oid,'pcp',3,'ELIMINAR');raise exception 'Locked order deleted';exception when raise_exception then if sqlerrm<>'ORDER_ITEM_LOCKED' then raise;end if;end;
 if (select revision from public.purchase_orders where id=oid)<>3 then raise exception 'Failed operation not rolled back';end if;
 perform public.save_purchase_order(jsonb_set(payload,'{items,1,description}','"Allowed description edit"'));
 if not exists(select 1 from public.purchase_order_items where id=b and operations_locked_at is not null and description='Allowed description edit') then raise exception 'Lock lost';end if;
 if not exists(select 1 from public.purchase_order_events where order_id=oid and revision=4 and snapshot->'items'->1->>'id'=b::text) then raise exception 'History identity missing';end if;
end $$;
set local role authenticated;
do $$ begin
 begin update public.purchase_order_items set operations_locked_at=null;raise exception 'Client can unlock';exception when insufficient_privilege then null;end;
end $$;
rollback;
