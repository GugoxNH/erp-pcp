begin;
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (length(btrim(sku)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 300),
  unit text not null check (unit in ('Pieza','Juego','Kit','Metro','Kilogramo','Litro','Caja','Paquete')),
  category text not null default '' check (length(category)<=100),
  brand text not null default '' check (length(brand)<=100),
  model text not null default '' check (length(model)<=100),
  notes text not null default '' check (length(notes)<=2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_unique on public.products (upper(btrim(sku)));
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant select,insert,update,delete on public.products to authenticated;
create policy products_admin on public.products for all to authenticated
using (exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check (exists(select 1 from public.app_admins where user_id=(select auth.uid())));
commit;
