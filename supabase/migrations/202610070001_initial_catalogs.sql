-- Run once in the Supabase SQL Editor. Does not import browser data.
begin;

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id text primary key check (length(btrim(id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  logo text not null default '',
  legal_name text not null default '',
  person_type text not null default '' check (person_type in ('', 'fisica', 'moral')),
  rfc text not null default '',
  email text not null default '',
  phone text not null default '',
  contact text not null default '',
  street text not null default '',
  exterior text not null default '',
  interior text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  country text not null default U&'M\00E9xico',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Text IDs preserve both existing catalog:<name> IDs and UUID strings.
-- RFC is not unique: different plants can share a taxpayer identity.
create table public.clients (
  id text primary key default gen_random_uuid()::text check (length(btrim(id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  legal_name text not null default '',
  person_type text not null default '' check (person_type in ('', 'fisica', 'moral')),
  rfc text not null default '',
  contact text not null default '',
  email text not null default '',
  phone text not null default '',
  street text not null default '',
  exterior text not null default '',
  interior text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  country text not null default U&'M\00E9xico',
  notes text not null default '',
  active boolean not null default true,
  legacy_name text not null default '',
  order_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_clients (
  business_id text not null references public.businesses(id) on delete restrict,
  client_id text not null references public.clients(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (business_id, client_id)
);
create index business_clients_client_idx on public.business_clients(client_id);

create table public.business_members (
  business_id text not null references public.businesses(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members(user_id);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
create trigger businesses_updated_at before update on public.businesses
for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

alter table public.app_admins enable row level security;
alter table public.businesses enable row level security;
alter table public.clients enable row level security;
alter table public.business_clients enable row level security;
alter table public.business_members enable row level security;

revoke all on public.app_admins, public.businesses, public.clients,
  public.business_clients, public.business_members from anon, authenticated;
grant select on public.app_admins to authenticated;
grant select, insert, update, delete on public.businesses, public.clients,
  public.business_clients, public.business_members to authenticated;

-- Administrator enrollment is only possible through trusted SQL/server access.
-- No browser role can promote itself, including an existing administrator.
create policy admins_read_self on public.app_admins for select to authenticated
using (user_id = (select auth.uid()));

create policy members_read on public.business_members for select to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.app_admins where user_id = (select auth.uid())
));
create policy members_admin_write on public.business_members for all to authenticated
using (exists (select 1 from public.app_admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.app_admins where user_id = (select auth.uid())));

create policy businesses_read on public.businesses for select to authenticated
using (exists (
  select 1 from public.business_members m
  where m.business_id = businesses.id and m.user_id = (select auth.uid())
));
create policy businesses_admin_write on public.businesses for all to authenticated
using (exists (select 1 from public.app_admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.app_admins where user_id = (select auth.uid())));

create policy associations_read on public.business_clients for select to authenticated
using (exists (
  select 1 from public.business_members m
  where m.business_id = business_clients.business_id and m.user_id = (select auth.uid())
));
create policy associations_admin_write on public.business_clients for all to authenticated
using (exists (select 1 from public.app_admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.app_admins where user_id = (select auth.uid())));

create policy clients_read on public.clients for select to authenticated
using (exists (
  select 1 from public.business_clients bc
  join public.business_members m on m.business_id = bc.business_id
  where bc.client_id = clients.id and m.user_id = (select auth.uid())
));
create policy clients_admin_write on public.clients for all to authenticated
using (exists (select 1 from public.app_admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.app_admins where user_id = (select auth.uid())));

insert into public.businesses (id, name, logo) values
  ('pcp', 'PCP', '/brands/pcp.png'),
  ('taasa', 'Taasa', '/brands/taasa.png'),
  ('jose', U&'Jos\00E9 Orozco', '/brands/jose.png');

commit;
