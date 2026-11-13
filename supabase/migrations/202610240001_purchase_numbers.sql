begin;
create table public.supplier_purchase_counters (
 business_id text not null references public.businesses(id),
 day date not null,
 last_value bigint not null check(last_value>0),
 primary key(business_id,day)
);
alter table public.supplier_purchase_counters enable row level security;
revoke all on public.supplier_purchase_counters from public,anon,authenticated;

create function public.purchase_user_initials(full_name text) returns text
language plpgsql immutable set search_path='' as $$
declare words text[]; n integer;
begin
 words:=regexp_split_to_array(btrim(upper(translate(coalesce(full_name,''),'áéíóúÁÉÍÓÚ','aeiouAEIOU'))),'\s+');
 n:=cardinality(words);
 if btrim(coalesce(full_name,''))='' then raise exception 'PURCHASE_USER_NAME';end if;
 return left(words[1],1)||case when n>=3 then left(words[n-1],1) else '' end||case when n>=2 then left(words[n],1) else '' end;
end $$;
revoke all on function public.purchase_user_initials(text) from public,anon,authenticated;

create function public.purchase_number_value(business text,allocate boolean) returns text
language plpgsql security definer set search_path='' as $$
declare today date:=(statement_timestamp() at time zone 'America/Mexico_City')::date;
 prefix text; initials text; next_value bigint; stem text;
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select left(upper(btrim(rfc)),3) into prefix from public.businesses where id=business and active;
 if not found then raise exception 'PURCHASE_INVALID';end if;
 if coalesce(prefix,'')='' then prefix:=case business when 'pcp' then 'PPC' when 'taasa' then 'TAC' when 'jose' then 'OOA' end;end if;
 if prefix is null or length(prefix)<>3 then raise exception 'PURCHASE_RFC';end if;
 select public.purchase_user_initials(full_name) into initials from public.app_profiles where user_id=auth.uid() and active;
 if initials is null then raise exception 'PURCHASE_USER_NAME';end if;
 if allocate then perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||business,0));end if;
 stem:=prefix||'-OC'||to_char(today,'YYYYMMDD')||'-';
 select greatest(
 coalesce((select last_value from public.supplier_purchase_counters where business_id=business and day=today),0),
 coalesce((select max(split_part(number,'-',3)::bigint) from public.supplier_purchases where business_id=business and number ~ ('^'||prefix||'-OC'||to_char(today,'YYYYMMDD')||'-[0-9]{4,12}-[^-]+$')),0)
 )+1 into next_value;
 if allocate then
  insert into public.supplier_purchase_counters values(business,today,next_value)
  on conflict(business_id,day) do update set last_value=excluded.last_value;
 end if;
 return stem||lpad(next_value::text,greatest(4,length(next_value::text)),'0')||'-'||initials;
end $$;
revoke all on function public.purchase_number_value(text,boolean) from public,anon,authenticated;
create function public.preview_purchase_number(business text) returns text
language sql security definer set search_path='' as $$
 select public.purchase_number_value(business,false);
$$;
revoke all on function public.preview_purchase_number(text) from public,anon;
grant execute on function public.preview_purchase_number(text) to authenticated;

-- Keep the existing transactional validation and history implementation.
alter function public.save_supplier_purchase(jsonb) rename to save_supplier_purchase_numbered_core;
revoke all on function public.save_supplier_purchase_numbered_core(jsonb) from public,anon,authenticated;
create function public.save_supplier_purchase(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved_number text; bid text; pid uuid;
begin
 if not public.has_section('purchases') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 bid:=payload->>'business_id';pid:=(payload->>'id')::uuid;
 if bid is null or bid not in ('pcp','taasa','jose') or pid is null then raise exception 'PURCHASE_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-purchases:'||bid,0));
 select number into saved_number from public.supplier_purchases where id=pid for update;
 if not found then saved_number:=public.purchase_number_value(bid,true);end if;
 return public.save_supplier_purchase_numbered_core(jsonb_set(payload,'{number}',to_jsonb(saved_number)));
end $$;
revoke all on function public.save_supplier_purchase(jsonb) from public,anon;
grant execute on function public.save_supplier_purchase(jsonb) to authenticated;
commit;
