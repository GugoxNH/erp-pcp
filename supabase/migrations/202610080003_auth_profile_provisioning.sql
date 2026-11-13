begin;
create or replace function public.provision_erp_user() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; creator uuid; begin
  p := new.raw_app_meta_data->'erp_profile';
  if p is null or exists(select 1 from public.app_profiles where user_id=new.id) then return new; end if;
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
-- Auth assigns trusted app metadata during creation via an UPDATE as well.
drop trigger provision_erp_user on auth.users;
create trigger provision_erp_user after insert or update of raw_app_meta_data on auth.users
for each row execute function public.provision_erp_user();
commit;
