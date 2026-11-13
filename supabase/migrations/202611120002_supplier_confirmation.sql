begin;
alter table public.supplier_purchases
 add column supplier_confirmation text,
 add column supplier_confirmed_at timestamptz,
 add column supplier_confirmed_by uuid references auth.users(id),
 add constraint supplier_confirmation_valid check (
 (supplier_confirmation is null and supplier_confirmed_at is null and supplier_confirmed_by is null) or
 (supplier_confirmation is not null and length(btrim(supplier_confirmation)) between 1 and 200 and supplier_confirmed_at is not null and supplier_confirmed_by is not null));
create function public.confirm_supplier_purchase(business text,target uuid,confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.supplier_purchases; a public.app_profiles; confirmed timestamptz:=now();
begin
 if not public.has_section('purchases') then raise exception 'CONFIRM_FORBIDDEN'; end if;
 if confirmation is null or length(btrim(confirmation)) not between 1 and 200 then raise exception 'CONFIRM_INVALID'; end if;
 select * into p from public.supplier_purchases where id=target and business_id=business for update;
 if not found then raise exception 'CONFIRM_NOT_FOUND'; end if;
 if p.supplier_confirmed_at is not null then
  if p.supplier_confirmation<>btrim(confirmation) then raise exception 'CONFIRM_ALREADY'; end if;
  return jsonb_build_object('number',p.supplier_confirmation,'date',p.supplier_confirmed_at);
 end if;
 if p.status='cancelled' then raise exception 'CONFIRM_CANCELLED'; end if;
 select * into a from public.app_profiles where user_id=auth.uid();
 update public.supplier_purchases set supplier_confirmation=btrim(confirmation),supplier_confirmed_at=confirmed,supplier_confirmed_by=auth.uid() where id=target;
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 values(auth.uid(),a.full_name,a.username,'purchase.supplier_confirmed',target::text,p.number,business,jsonb_build_object('confirmation',btrim(confirmation),'confirmed_at',confirmed,'description','Validó la confirmación del proveedor de la compra '||p.number||': '||btrim(confirmation)||'.'));
 return jsonb_build_object('number',btrim(confirmation),'date',confirmed);
end $$;
revoke all on function public.confirm_supplier_purchase(text,uuid,text) from public,anon;
grant execute on function public.confirm_supplier_purchase(text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
