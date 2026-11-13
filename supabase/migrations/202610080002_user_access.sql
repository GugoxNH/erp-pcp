begin;
create table public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  sections text[] not null check (cardinality(sections) between 1 and 6 and sections <@ array['dashboard','businesses','clients','orders','products','users']::text[]),
  active boolean not null default true,
  is_developer boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.app_profiles for each row execute function public.set_updated_at();
alter table public.app_profiles enable row level security;
revoke all on public.app_profiles from public,anon,authenticated;
grant select on public.app_profiles to authenticated;

-- Preserve existing privileged accounts without changing their credentials.
insert into public.app_profiles(user_id,username,full_name,sections,is_developer)
select a.user_id, case when row_number() over(order by a.created_at,a.user_id)=1 then 'desarrollador' else 'dev-'||replace(a.user_id::text,'-','') end,
coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1),'Desarrollador'),
array['dashboard','businesses','clients','orders','products','users'],true
from public.app_admins a join auth.users u on u.id=a.user_id;

create function public.has_section(section_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_profiles where user_id=auth.uid() and active and (is_developer or section_name=any(sections)));
$$;
revoke all on function public.has_section(text) from public,anon;
grant execute on function public.has_section(text) to authenticated;
create policy profiles_read on public.app_profiles for select to authenticated
using(user_id=(select auth.uid()) or (select public.has_section('users')));

create table public.user_access_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null, action text not null,
  snapshot jsonb not null, created_at timestamptz not null default now()
);
create index user_access_events_actor_idx on public.user_access_events(actor_id);
create index user_access_events_target_idx on public.user_access_events(target_id);
alter table public.user_access_events enable row level security;
revoke all on public.user_access_events from public,anon,authenticated;
grant select on public.user_access_events to authenticated;
create policy access_events_read on public.user_access_events for select to authenticated using ((select public.has_section('users')));

-- Only the trusted Auth admin API can set app_metadata. Profile provisioning is
-- atomic with Auth creation; ordinary signup metadata cannot grant access.
create function public.provision_erp_user() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; creator uuid; begin
  p := new.raw_app_meta_data->'erp_profile';
  if p is null then return new; end if;
  creator := (p->>'created_by')::uuid;
  if not exists(select 1 from public.app_profiles where user_id=creator and active and (is_developer or 'users'=any(sections))) then
    raise exception 'USER_FORBIDDEN' using errcode='42501';
  end if;
  insert into public.app_profiles(user_id,username,full_name,sections)
  values(new.id,p->>'username',p->>'full_name',array(select jsonb_array_elements_text(p->'sections')));
  insert into public.user_access_events(actor_id,target_id,action,snapshot)
  values(creator,new.id,'create',p-'created_by');
  return new;
end $$;
revoke all on function public.provision_erp_user() from public,anon,authenticated;
create trigger provision_erp_user after insert on auth.users for each row execute function public.provision_erp_user();

create function public.update_user_access(target uuid, expected timestamptz, display_name text, grants text[], enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare current_profile public.app_profiles; begin
  if not public.has_section('users') then raise exception 'USER_FORBIDDEN' using errcode='42501'; end if;
  select * into current_profile from public.app_profiles where user_id=target for update;
  if not found or current_profile.updated_at is distinct from expected then raise exception 'USER_CONFLICT'; end if;
  if current_profile.is_developer or target=auth.uid() then raise exception 'USER_PROTECTED'; end if;
  update public.app_profiles set full_name=btrim(display_name),sections=grants,active=enabled where user_id=target;
  insert into public.user_access_events(actor_id,target_id,action,snapshot)
  values(auth.uid(),target,'update',jsonb_build_object('full_name',display_name,'sections',grants,'active',enabled));
end $$;
revoke all on function public.update_user_access(uuid,timestamptz,text,text[],boolean) from public,anon;
grant execute on function public.update_user_access(uuid,timestamptz,text,text[],boolean) to authenticated;

-- Replace legacy administrator/member policies; authorization is now per module.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in
    ('businesses','clients','business_clients','business_members','products','purchase_orders','purchase_order_items','purchase_order_events') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy businesses_read on public.businesses for select to authenticated using ((select public.has_section('businesses') or public.has_section('clients') or public.has_section('orders')));
create policy businesses_write on public.businesses for all to authenticated using ((select public.has_section('businesses'))) with check ((select public.has_section('businesses')));
create policy clients_read on public.clients for select to authenticated using ((select public.has_section('businesses') or public.has_section('clients') or public.has_section('orders')));
create policy clients_write on public.clients for all to authenticated using ((select public.has_section('clients'))) with check ((select public.has_section('clients')));
create policy links_read on public.business_clients for select to authenticated using ((select public.has_section('businesses') or public.has_section('clients') or public.has_section('orders')));
create policy links_write on public.business_clients for all to authenticated using ((select public.has_section('businesses'))) with check ((select public.has_section('businesses')));
revoke insert,update,delete on public.business_members from authenticated;
create policy members_self on public.business_members for select to authenticated using(user_id=(select auth.uid()) and (select public.has_section('businesses')));
create policy products_access on public.products for all to authenticated using ((select public.has_section('products'))) with check ((select public.has_section('products')));
create policy orders_read on public.purchase_orders for select to authenticated using ((select public.has_section('orders')));
create policy items_read on public.purchase_order_items for select to authenticated using ((select public.has_section('orders')));
create policy events_read on public.purchase_order_events for select to authenticated using ((select public.has_section('orders')));

-- Preserve the tested order/import implementations, replacing only their guards.
do $$ declare definition text; old_guard text; begin
  definition:=pg_get_functiondef('public.save_purchase_order(jsonb)'::regprocedure);
  old_guard:='auth.uid() is null or not exists(select 1 from public.app_admins where user_id = auth.uid())';
  if position(old_guard in definition)=0 then raise exception 'Order guard differs; review migration'; end if;
  execute replace(definition,old_guard,'not public.has_section(''orders'')');
  definition:=pg_get_functiondef('public.import_local_catalogs(jsonb)'::regprocedure);
  old_guard:='not exists (select 1 from public.app_admins where user_id = auth.uid())';
  if position(old_guard in definition)=0 then raise exception 'Import guard differs; review migration'; end if;
  execute replace(definition,old_guard,'not (public.has_section(''businesses'') and public.has_section(''clients''))');
end $$;
commit;
