begin;
alter table public.purchase_order_events add column actor_snapshot jsonb;
-- Historical names are recovered from the current profile; future names are frozen at save time.
update public.purchase_order_events e set actor_snapshot=jsonb_build_object('username',p.username,'full_name',p.full_name)
from public.app_profiles p where p.user_id=e.actor_id;
create function public.capture_order_event_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.actor_snapshot := null;
  if new.actor_id is not null then
    select jsonb_build_object('username',p.username,'full_name',p.full_name) into new.actor_snapshot
    from public.app_profiles p where p.user_id=new.actor_id;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_order_event_actor() from public,anon,authenticated;
create trigger order_event_actor before insert on public.purchase_order_events for each row execute function public.capture_order_event_actor();
commit;
