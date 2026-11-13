begin;
alter table public.suppliers add column contacts jsonb not null default '[]'::jsonb;
update public.suppliers set contacts=jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'name',contact_name,'position','','email',email,'mobile',mobile))
where btrim(contact_name)<>'' or btrim(email)<>'' or btrim(mobile)<>'';
create function public.validate_supplier_contacts() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb; k text; max_length integer; ids text[]:='{}'; begin
 if jsonb_typeof(new.contacts) is distinct from 'array' then raise exception 'INVALID_SUPPLIER_CONTACTS' using errcode='23514'; end if;
 for c in select value from jsonb_array_elements(new.contacts) loop
  if jsonb_typeof(c) is distinct from 'object' then raise exception 'INVALID_SUPPLIER_CONTACTS' using errcode='23514'; end if;
  foreach k in array array['id','name','position','email','mobile'] loop
   max_length:=case k when 'id' then 80 when 'email' then 254 when 'mobile' then 40 else 160 end;
   if jsonb_typeof(c->k) is distinct from 'string' or length(c->>k)>max_length then raise exception 'INVALID_SUPPLIER_CONTACTS' using errcode='23514'; end if;
  end loop;
  if btrim(c->>'id')='' or (c->>'id')=any(ids) or (btrim(c->>'name')='' and btrim(c->>'email')='' and btrim(c->>'mobile')='') then raise exception 'INVALID_SUPPLIER_CONTACTS' using errcode='23514'; end if;
  if c->>'email'<>'' and c->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_SUPPLIER_CONTACTS' using errcode='23514'; end if;
  ids:=array_append(ids,c->>'id');
 end loop;
 new.contact_name:=coalesce(new.contacts->0->>'name','');
 new.email:=coalesce(new.contacts->0->>'email','');
 new.mobile:=coalesce(new.contacts->0->>'mobile','');
 return new;
end $$;
create trigger suppliers_contacts before insert or update on public.suppliers for each row execute function public.validate_supplier_contacts();
revoke all on function public.validate_supplier_contacts() from public,anon,authenticated;
commit;
