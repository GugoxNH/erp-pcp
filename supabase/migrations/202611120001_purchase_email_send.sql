begin;
create table public.purchase_email_sends (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 actor_name text not null, actor_username text not null,
 purchase_id uuid not null references public.supplier_purchases(id), business_id text not null,
 purchase_number text not null, payload_hash text not null,
 state text not null default 'sending' check(state in ('sending','sent','failed','partial','unknown')),
 metadata jsonb not null, result jsonb, created_at timestamptz not null default now(), finished_at timestamptz
);
alter table public.purchase_email_sends enable row level security;
revoke all on public.purchase_email_sends from public,anon,authenticated;
grant select on public.purchase_email_sends to authenticated;
grant select,insert,update on public.purchase_email_sends to service_role;
create policy email_send_read on public.purchase_email_sends for select to authenticated using(actor_id=auth.uid() and public.has_section('purchases'));

create function public.claim_purchase_email(request_id uuid, target uuid, business text, fingerprint text, info jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.supplier_purchases; a public.app_profiles; s public.purchase_email_sends;
begin
 if not public.has_section('purchases') then raise exception 'EMAIL_FORBIDDEN'; end if;
 if request_id is null or fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' or info is null or jsonb_typeof(info)<>'object' or length(info::text)>20000 then raise exception 'EMAIL_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into s from public.purchase_email_sends where id=request_id;
 if found then
  if s.actor_id<>auth.uid() or s.purchase_id<>target or s.business_id<>business or s.payload_hash<>fingerprint then raise exception 'EMAIL_CONFLICT'; end if;
  return jsonb_build_object('claimed',false,'state',s.state,'result',s.result);
 end if;
 select * into p from public.supplier_purchases where id=target and business_id=business for share;
 if not found or p.status='cancelled' then raise exception 'EMAIL_PURCHASE_UNAVAILABLE'; end if;
 select * into a from public.app_profiles where user_id=auth.uid();
 insert into public.purchase_email_sends(id,actor_id,actor_name,actor_username,purchase_id,business_id,purchase_number,payload_hash,metadata)
 values(request_id,auth.uid(),a.full_name,a.username,target,business,p.number,fingerprint,info);
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 values(auth.uid(),a.full_name,a.username,'purchase.email.started',target::text,p.number,business,info||jsonb_build_object('request_id',request_id,'description','Inició el envío de correo de la compra '||p.number||'.'));
 return jsonb_build_object('claimed',true,'state','sending');
end $$;
revoke all on function public.claim_purchase_email(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.claim_purchase_email(uuid,uuid,text,text,jsonb) to authenticated;

create function public.finish_purchase_email(request_id uuid, owner_id uuid, outcome text, summary jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s public.purchase_email_sends; description text;
begin
 if outcome not in ('sent','failed','partial','unknown') or outcome is null or summary is null or length(summary::text)>20000 then raise exception 'EMAIL_INVALID'; end if;
 select * into s from public.purchase_email_sends where id=request_id and actor_id=owner_id for update;
 if not found then raise exception 'EMAIL_NOT_FOUND'; end if;
 if s.state<>'sending' then return; end if;
 description:=case outcome when 'sent' then 'Envió correctamente el correo de la compra ' when 'partial' then 'Envío parcial del correo de la compra ' when 'failed' then 'Falló el envío de correo de la compra ' else 'Resultado incierto al enviar el correo de la compra ' end||s.purchase_number||'. '||coalesce(summary->>'message','');
 update public.purchase_email_sends set state=outcome,result=summary,finished_at=now() where id=request_id;
 insert into public.activity_log(actor_id,actor_name,actor_username,action,entity_id,entity_label,business_id,details)
 values(s.actor_id,s.actor_name,s.actor_username,'purchase.email.'||outcome,s.purchase_id::text,s.purchase_number,s.business_id,s.metadata||summary||jsonb_build_object('request_id',request_id,'description',description));
end $$;
revoke all on function public.finish_purchase_email(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_purchase_email(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
