begin;
alter table public.app_profiles add column edit_orders boolean not null default false;
update public.app_profiles set edit_orders=true where is_developer;
create or replace function public.update_user_access(target uuid, expected timestamptz, display_name text, grants text[], enabled boolean, warehouse_edit boolean, users_edit boolean, orders_edit boolean)
returns void language plpgsql security definer set search_path='' as $$
declare current_profile public.app_profiles;
begin
 if not public.has_section('users') or not exists(select 1 from public.app_profiles where user_id=auth.uid() and active and (is_developer or edit_users)) then raise exception 'USER_FORBIDDEN' using errcode='42501';end if;
 select * into current_profile from public.app_profiles where user_id=target for update;
 if not found or current_profile.updated_at is distinct from expected then raise exception 'USER_CONFLICT';end if;
 if current_profile.is_developer or target=auth.uid() then raise exception 'USER_PROTECTED';end if;
 update public.app_profiles set full_name=btrim(display_name),sections=grants,active=enabled,edit_warehouse=warehouse_edit,edit_users=users_edit,edit_orders=orders_edit where user_id=target;
 insert into public.user_access_events(actor_id,target_id,action,snapshot)
 values(auth.uid(),target,'update',jsonb_build_object('full_name',display_name,'sections',grants,'active',enabled,'edit_warehouse',warehouse_edit,'edit_users',users_edit,'edit_orders',orders_edit));
end $$;
revoke all on function public.update_user_access(uuid,timestamptz,text,text[],boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.update_user_access(uuid,timestamptz,text,text[],boolean,boolean,boolean,boolean) to authenticated;

-- Older signatures delegate here and preserve the omitted permission.
create or replace function public.update_user_access(target uuid, expected timestamptz, display_name text, grants text[], enabled boolean, warehouse_edit boolean, users_edit boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.app_profiles;
begin
 select * into p from public.app_profiles where user_id=target;
 perform public.update_user_access(target,expected,display_name,grants,enabled,warehouse_edit,users_edit,p.edit_orders);
end $$;
create or replace function public.provision_erp_user() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; creator uuid;
begin
 p:=new.raw_app_meta_data->'erp_profile';
 if p is null or exists(select 1 from public.app_profiles where user_id=new.id) then return new;end if;
 creator:=(p->>'created_by')::uuid;
 if not exists(select 1 from public.app_profiles where user_id=creator and active and (is_developer or ('users'=any(sections) and edit_users))) then raise exception 'USER_FORBIDDEN' using errcode='42501';end if;
 insert into public.app_profiles(user_id,username,full_name,sections,edit_warehouse,edit_users,edit_orders)
 values(new.id,p->>'username',p->>'full_name',array(select jsonb_array_elements_text(p->'sections')),coalesce((p->>'edit_warehouse')::boolean,false),coalesce((p->>'edit_users')::boolean,false),coalesce((p->>'edit_orders')::boolean,false));
 insert into public.user_access_events(actor_id,target_id,action,snapshot) values(creator,new.id,'create',p-'created_by');
 return new;
end $$;
revoke all on function public.provision_erp_user() from public,anon,authenticated;

-- Check actual existence under the existing transaction lock, independent of supplied revision.
do $migration$
declare definition text; marker text := '  select * into existing from public.purchase_orders where id = oid for update;';
begin
 definition:=pg_get_functiondef('public.save_purchase_order(jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Unexpected save_purchase_order definition'; end if;
 execute replace(definition,marker,marker || $guard$
  if existing.id is not null and not exists(select 1 from public.app_profiles where user_id=auth.uid() and active and (is_developer or edit_orders)) then
    raise exception 'ORDER_EDIT_FORBIDDEN' using errcode='42501';
  end if;
$guard$);
end $migration$;
notify pgrst, 'reload schema';
commit;
