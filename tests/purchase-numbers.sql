-- Run after 202610240001; all allocations are rolled back.
begin;
do $$ begin
 if public.purchase_user_initials('Juan Luis Pérez López')<>'JPL' then raise exception 'Initials mismatch';end if;
 if public.purchase_user_initials('  Luis   Orozco  Martínez ')<>'LOM' then raise exception 'Whitespace mismatch';end if;
end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_profiles where is_developer and active limit 1),true);
do $$
declare proposal text; actual text; following text; today date:=(statement_timestamp() at time zone 'America/Mexico_City')::date;
begin
 proposal:=public.preview_purchase_number('taasa');
 if proposal is distinct from public.preview_purchase_number('taasa') then raise exception 'Preview consumed sequence';end if;
 actual:=public.purchase_number_value('taasa',true);
 if proposal<>actual then raise exception 'Allocation mismatch';end if;
 following:=public.purchase_number_value('taasa',true);
 if split_part(following,'-',3)::bigint<>split_part(actual,'-',3)::bigint+1 then raise exception 'Sequence mismatch';end if;
 if split_part(actual,'-',2)<>'OC'||to_char(today,'YYYYMMDD') then raise exception 'Date mismatch';end if;
 if not exists(select 1 from public.supplier_purchase_counters where business_id='taasa' and day=today) then raise exception 'Daily counter missing';end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.purchase_number_value('taasa',true);raise exception 'Counter exposed';exception when insufficient_privilege then null;end;
 begin perform public.save_supplier_purchase_numbered_core('{}');raise exception 'Core exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
 begin perform public.preview_purchase_number('taasa');raise exception 'Unauthorized preview';exception when insufficient_privilege then null;end;
end $$;
rollback;
