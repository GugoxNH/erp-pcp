begin;
create table public.company_email_connections (
 user_id uuid primary key references public.app_profiles(user_id) on delete cascade,
 email text not null, host text not null, port integer not null check(port=465),
 password_encrypted text not null, validated_at timestamptz not null default now()
);
create table public.company_email_attempts (
 user_id uuid primary key references public.app_profiles(user_id) on delete cascade,
 attempt_id uuid, window_started timestamptz not null default now(),
 attempts integer not null default 0, started_at timestamptz not null default now()
);
alter table public.company_email_connections enable row level security;
alter table public.company_email_attempts enable row level security;
revoke all on public.company_email_connections,public.company_email_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.company_email_connections,public.company_email_attempts to service_role;
create function public.begin_company_email_check(owner_id uuid, attempt uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.company_email_attempts;
begin
 if not exists(select 1 from public.app_profiles where user_id=owner_id and active) then raise exception 'PROFILE_FORBIDDEN'; end if;
 insert into public.company_email_attempts(user_id) values(owner_id) on conflict do nothing;
 select * into a from public.company_email_attempts where user_id=owner_id for update;
 if a.window_started>now()-interval '15 minutes' and a.attempts>=5 then raise exception 'EMAIL_RATE_LIMIT'; end if;
 update public.company_email_attempts set attempt_id=attempt,started_at=now(),
 attempts=case when a.window_started<=now()-interval '15 minutes' then 1 else a.attempts+1 end,
 window_started=case when a.window_started<=now()-interval '15 minutes' then now() else a.window_started end where user_id=owner_id;
end $$;
create function public.finish_company_email_check(owner_id uuid, attempt uuid, address text, server_host text, encrypted_password text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.company_email_attempts;
begin
 select * into a from public.company_email_attempts where user_id=owner_id for update;
 if not found or a.attempt_id is distinct from attempt or attempt is null or a.started_at<now()-interval '2 minutes' then raise exception 'EMAIL_CHECK_EXPIRED'; end if;
 if not exists(select 1 from public.app_profiles where user_id=owner_id and active) then raise exception 'PROFILE_FORBIDDEN'; end if;
 insert into public.company_email_connections(user_id,email,host,port,password_encrypted) values(owner_id,address,server_host,465,encrypted_password)
 on conflict(user_id) do update set email=excluded.email,host=excluded.host,password_encrypted=excluded.password_encrypted,validated_at=now();
 update public.company_email_attempts set attempt_id=null where user_id=owner_id;
end $$;
create function public.disconnect_company_email(owner_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.company_email_attempts set attempt_id=null where user_id=owner_id;
 delete from public.company_email_connections where user_id=owner_id;
end $$;
revoke all on function public.begin_company_email_check(uuid,uuid),public.finish_company_email_check(uuid,uuid,text,text,text),public.disconnect_company_email(uuid) from public,anon,authenticated;
grant execute on function public.begin_company_email_check(uuid,uuid),public.finish_company_email_check(uuid,uuid,text,text,text),public.disconnect_company_email(uuid) to service_role;
notify pgrst,'reload schema';
commit;
