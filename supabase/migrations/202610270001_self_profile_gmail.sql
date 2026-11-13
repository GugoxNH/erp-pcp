begin;
-- Self-service editing has no target argument and cannot modify access grants.
create function public.update_my_profile(expected timestamptz, display_name text, login_name text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.app_profiles;
begin
 select * into p from public.app_profiles where user_id=auth.uid() for update;
 if not found or not p.active then raise exception 'PROFILE_FORBIDDEN' using errcode='42501'; end if;
 if p.updated_at is distinct from expected then raise exception 'PROFILE_CONFLICT'; end if;
 if display_name is null or length(btrim(display_name)) not between 1 and 160
 or login_name is null or lower(btrim(login_name)) !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'PROFILE_INVALID'; end if;
 update public.app_profiles set full_name=btrim(display_name),username=lower(btrim(login_name)) where user_id=auth.uid();
 insert into public.user_access_events(actor_id,target_id,action,snapshot)
 values(auth.uid(),auth.uid(),'profile.update',jsonb_build_object('full_name',btrim(display_name),'username',lower(btrim(login_name))));
end $$;
revoke all on function public.update_my_profile(timestamptz,text,text) from public,anon;
grant execute on function public.update_my_profile(timestamptz,text,text) to authenticated;

-- Tokens and OAuth attempts are accessible exclusively to the trusted server.
create table public.gmail_connections (
 user_id uuid primary key references public.app_profiles(user_id) on delete cascade,
 google_subject text not null,
 email text not null,
 refresh_token_encrypted text not null,
 connected_at timestamptz not null default now()
);
create table public.gmail_oauth_attempts (
 state_hash text primary key,
 user_id uuid not null references public.app_profiles(user_id) on delete cascade,
 verifier_encrypted text not null,
 expires_at timestamptz not null
);
create index gmail_oauth_expiry on public.gmail_oauth_attempts(expires_at);
alter table public.gmail_connections enable row level security;
alter table public.gmail_oauth_attempts enable row level security;
revoke all on public.gmail_connections,public.gmail_oauth_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.gmail_connections,public.gmail_oauth_attempts to service_role;
-- Persist only while the attempt still exists. Disconnect deletes pending attempts,
-- so an in-flight callback cannot restore a connection after disconnection.
create function public.finish_gmail_connection(attempt_hash text, owner_id uuid, subject text, address text, encrypted_token text)
returns void language plpgsql security definer set search_path='' as $$
declare attempt public.gmail_oauth_attempts;
begin
 select * into attempt from public.gmail_oauth_attempts where state_hash=attempt_hash and user_id=owner_id for update;
 if not found or attempt.expires_at<now() then raise exception 'GMAIL_EXPIRED'; end if;
 if not exists(select 1 from public.app_profiles where user_id=owner_id and active) then raise exception 'PROFILE_FORBIDDEN'; end if;
 delete from public.gmail_oauth_attempts where state_hash=attempt_hash;
 insert into public.gmail_connections(user_id,google_subject,email,refresh_token_encrypted)
 values(owner_id,subject,address,encrypted_token)
 on conflict(user_id) do update set google_subject=excluded.google_subject,email=excluded.email,refresh_token_encrypted=excluded.refresh_token_encrypted,connected_at=now();
end $$;
revoke all on function public.finish_gmail_connection(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_gmail_connection(text,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
