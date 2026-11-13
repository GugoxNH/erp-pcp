-- Fixtures, products, links, orders and events are all rolled back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_admins limit 1),true);
set local role authenticated;
do $$
declare cid text:='qa-product-'||gen_random_uuid(); oid uuid:=gen_random_uuid(); pid uuid;
 payload jsonb; bad jsonb; field text; rejected boolean;
begin
 insert into public.clients(id,name) values(cid,cid);
 insert into public.business_clients(business_id,client_id) values('pcp',cid);
 payload:=jsonb_build_object('item_delivery_version',4,'id',oid,'revision',0,'business_id','pcp','client_id',cid,'number','QA-PRODUCT','kind','parts','status','draft','fulfillment','pending','order_date','2026-10-13','commitment_date','','completed_date','','currency','MXN','tax','0','source',null,'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'subitems','[]'::jsonb,'kind','parts','code','CUSTOMER-1','description','Part','unit','PZA','commitment_date','2026-10-14','fulfillment','pending','completed_date','','quantity','1','unit_price','10','discount','0')));
 rejected:=false;
 begin perform public.save_purchase_order(payload); exception when raise_exception then if sqlerrm<>'ORDER_PRODUCT_REQUIRED' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'Unlinked code accepted'; end if;
 perform public.resolve_order_product('pcp',cid,'CUSTOMER-1',null,jsonb_build_object('sku',cid,'name','QA part','unit','Pieza'));
 select product_id into pid from public.product_client_codes where client_id=cid and code='CUSTOMER-1';
 if pid is null then raise exception 'Missing link'; end if;
 perform public.resolve_order_product('pcp',cid,'CUSTOMER-2',pid,null);
 if (select count(*) from public.product_client_codes where product_id=pid)<>2 then raise exception 'Prior links replaced'; end if;
 if not exists(select 1 from public.order_product_options('pcp',cid) where id=pid) then raise exception 'Missing option'; end if;
 foreach field in array array['number','order_date'] loop
  rejected:=false;bad:=jsonb_set(payload,array[field],'""'::jsonb);
  begin perform public.save_purchase_order(bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Missing header accepted: %',field; end if;
 end loop;
 foreach field in array array['code','kind','commitment_date','quantity','unit_price'] loop
  rejected:=false;bad:=jsonb_set(payload,array['items','0',field],'""'::jsonb);
  begin perform public.save_purchase_order(bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Missing item field accepted: %',field; end if;
 end loop;
 perform public.save_purchase_order(payload);
 if (select product_id from public.purchase_order_items where order_id=oid) is distinct from pid then raise exception 'Product identity not saved'; end if;
 rejected:=false;
 begin delete from public.products where id=pid; exception when foreign_key_violation then rejected:=true; end;
 if not rejected then raise exception 'Referenced product deleted'; end if;
 payload:=jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid()));
 payload:=jsonb_set(payload,'{items,0,id}',to_jsonb(gen_random_uuid()));
 payload:=jsonb_set(payload,'{number}','"QA-SERVICE"');
 payload:=jsonb_set(payload,'{items,0,kind}','"service"');
 payload:=jsonb_set(payload,'{items,0,code}','""');
 perform public.save_purchase_order(payload);
 -- Calls with no authenticated profile cannot mutate the catalog.
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;
 begin perform public.resolve_order_product('pcp',cid,'FORBIDDEN',pid,null); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Unauthorized association accepted'; end if;
end $$;
rollback;
