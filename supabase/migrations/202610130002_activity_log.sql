begin;
alter table public.app_profiles drop constraint app_profiles_sections_check;
alter table public.app_profiles add constraint app_profiles_sections_check check(cardinality(sections) between 1 and 7 and sections <@ array['dashboard','businesses','clients','orders','products','users','audit']::text[]);
update public.app_profiles set sections=array_append(sections,'audit') where is_developer and not ('audit'=any(sections));
create table public.activity_log (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 actor_name text not null, actor_username text not null,
 occurred_at timestamptz not null default now(),
 action text not null, entity_id text not null, entity_label text not null,
 business_id text not null, details jsonb not null default '{}'::jsonb
);
create index activity_log_time on public.activity_log(occurred_at desc,id);
create index activity_log_actor on public.activity_log(actor_id);
alter table public.activity_log enable row level security;
revoke all on public.activity_log from public,anon,authenticated;
grant select on public.activity_log to authenticated;
create policy activity_log_read on public.activity_log for select to authenticated using((select public.has_section('audit')));
create function public.delete_purchase_order(target uuid, business text, expected integer, confirmation text)
returns void language plpgsql security definer set search_path='' as $$
declare current_order public.purchase_orders%rowtype; profile public.app_profiles%rowtype;
begin
 if not public.has_section('orders') then raise exception 'ORDER_FORBIDDEN' using errcode='42501'; end if;
 if confirmation is distinct from 'ELIMINAR' then raise exception 'ORDER_CONFIRMATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 select * into current_order from public.purchase_orders where id=target and business_id=business for update;
 if not found or current_order.revision is distinct from expected then raise exception 'ORDER_CONFLICT'; end if;
 select * into profile from public.app_profiles where user_id=auth.uid();
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 values(auth.uid(),profile.full_name,profile.username,'purchase_order.deleted',target::text,current_order.number,business,
 jsonb_build_object('client',current_order.client_snapshot->>'name','revision',current_order.revision,'total',current_order.total,'currency',current_order.currency));
 delete from public.purchase_order_events where order_id=target;
 delete from public.purchase_order_items where order_id=target;
 delete from public.purchase_orders where id=target;
end;
$$;
revoke all on function public.delete_purchase_order(uuid,text,integer,text) from public,anon;
grant execute on function public.delete_purchase_order(uuid,text,integer,text) to authenticated;
commit;
