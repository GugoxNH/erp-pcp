begin;
alter table public.clients add column contacts jsonb;
update public.clients set contacts = case when contact<>'' or email<>'' or phone<>''
  then jsonb_build_array(jsonb_build_object('id','legacy','name',contact,'area','','email',email,'phone',phone))
  else '[]'::jsonb end;

create function public.sync_client_contacts() returns trigger
language plpgsql set search_path='' as $$
declare entry jsonb; ids text[] := '{}'; first_contact jsonb; begin
  if new.contacts is null then
    new.contacts := case when new.contact<>'' or new.email<>'' or new.phone<>''
      then jsonb_build_array(jsonb_build_object('id','legacy','name',new.contact,'area','','email',new.email,'phone',new.phone))
      else '[]'::jsonb end;
  elsif tg_op='UPDATE' then
    -- Older clients may still edit the single-contact columns. Keep the other
    -- contacts and the first contact's area instead of silently discarding them.
    if new.contacts=old.contacts and (new.contact,new.email,new.phone) is distinct from (old.contact,old.email,old.phone) then
      first_contact := coalesce(new.contacts->0,jsonb_build_object('id','legacy','area',''))
        || jsonb_build_object('name',new.contact,'email',new.email,'phone',new.phone);
      if jsonb_array_length(new.contacts)>0 then
        new.contacts := jsonb_set(new.contacts,'{0}',first_contact);
      else new.contacts := jsonb_build_array(first_contact); end if;
    end if;
  end if;
  if jsonb_typeof(new.contacts) is distinct from 'array' then raise exception 'CLIENT_CONTACTS_INVALID' using errcode='23514'; end if;
  for entry in select value from jsonb_array_elements(new.contacts) loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'id') is distinct from 'string'
      or length(btrim(entry->>'id')) not between 1 and 80
      or jsonb_typeof(entry->'name') is distinct from 'string' or length(entry->>'name')>500
      or jsonb_typeof(entry->'area') is distinct from 'string' or length(entry->>'area')>500
      or jsonb_typeof(entry->'email') is distinct from 'string' or length(entry->>'email')>500
      or jsonb_typeof(entry->'phone') is distinct from 'string' or length(entry->>'phone')>500
      or entry->>'id'=any(ids) then raise exception 'CLIENT_CONTACTS_INVALID' using errcode='23514'; end if;
    ids := array_append(ids,entry->>'id');
  end loop;
  new.contact := coalesce(new.contacts->0->>'name','');
  new.email := coalesce(new.contacts->0->>'email','');
  new.phone := coalesce(new.contacts->0->>'phone','');
  return new;
end $$;
revoke all on function public.sync_client_contacts() from public,anon,authenticated;
create trigger clients_sync_contacts before insert or update on public.clients
for each row execute function public.sync_client_contacts();
alter table public.clients alter column contacts set not null;
alter table public.clients add constraint clients_contacts_array check(jsonb_typeof(contacts)='array');

-- Retain import permissions and conflict behavior; include the new column in
-- its existing atomic insert. Legacy payloads become a single contact in trigger.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.import_local_catalogs(jsonb)'::regprocedure);
  if position('country, notes, active, legacy_name, order_template' in definition)=0
    or position('client_row.notes, client_row.active, client_row.legacy_name, client_row.order_template' in definition)=0 then
    raise exception 'Import definition differs; review migration';
  end if;
  definition:=replace(definition,'country, notes, active, legacy_name, order_template','country, notes, active, legacy_name, order_template, contacts');
  definition:=replace(definition,'client_row.notes, client_row.active, client_row.legacy_name, client_row.order_template','client_row.notes, client_row.active, client_row.legacy_name, client_row.order_template, client_row.contacts');
  execute definition;
end $$;
commit;
