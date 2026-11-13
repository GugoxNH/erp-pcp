begin;

-- Prevent duplicate names even when requests arrive concurrently.
create unique index clients_name_unique on public.clients (lower(btrim(name)));

-- Invoker permissions retain RLS. Any error rolls back the entire import.
create function public.import_local_catalogs(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  existing jsonb;
  client_row public.clients;
  business_row public.businesses;
  imported_clients integer := 0;
  imported_businesses integer := 0;
  imported_links integer := 0;
  affected integer;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'IMPORT_FORBIDDEN';
  end if;
  if jsonb_typeof(payload->'clients') is distinct from 'array'
     or jsonb_typeof(payload->'businesses') is distinct from 'array'
     or jsonb_typeof(payload->'links') is distinct from 'array'
     or jsonb_array_length(payload->'clients') > 1000
     or jsonb_array_length(payload->'businesses') > 3
     or jsonb_array_length(payload->'links') > 3000 then
    raise exception 'IMPORT_INVALID';
  end if;

  -- A short exclusive lock prevents concurrent edits between comparison and insert.
  lock table public.clients, public.businesses, public.business_clients in share row exclusive mode;

  for item in select value from jsonb_array_elements(payload->'clients') loop
    select to_jsonb(c) - array['created_at','updated_at'] into existing
      from public.clients c where c.id = item->>'id';
    if found then
      if existing is distinct from item then raise exception 'IMPORT_CLIENT_CONFLICT: %', item->>'name'; end if;
    else
      client_row := jsonb_populate_record(null::public.clients, item);
      insert into public.clients (
        id, name, legal_name, person_type, rfc, contact, email, phone,
        street, exterior, interior, neighborhood, city, state, postal_code,
        country, notes, active, legacy_name, order_template
      ) values (
        client_row.id, client_row.name, client_row.legal_name, client_row.person_type,
        client_row.rfc, client_row.contact, client_row.email, client_row.phone,
        client_row.street, client_row.exterior, client_row.interior, client_row.neighborhood,
        client_row.city, client_row.state, client_row.postal_code, client_row.country,
        client_row.notes, client_row.active, client_row.legacy_name, client_row.order_template
      );
      imported_clients := imported_clients + 1;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'businesses') loop
    if item->>'id' not in ('pcp', 'taasa', 'jose') then raise exception 'IMPORT_INVALID'; end if;
    select to_jsonb(b) - array['name','logo','active','created_at','updated_at'] into existing
      from public.businesses b where b.id = item->>'id';
    if not found then raise exception 'IMPORT_BUSINESS_MISSING'; end if;
    if existing is distinct from item then
      if exists (select 1 from jsonb_each_text(existing - array['id','country']) f where f.value <> '')
        or existing->>'country' not in ('', U&'M\00E9xico') then
        raise exception 'IMPORT_BUSINESS_CONFLICT: %', item->>'id';
      end if;
      business_row := jsonb_populate_record(null::public.businesses, item);
      update public.businesses set
        legal_name = business_row.legal_name, person_type = business_row.person_type,
        rfc = business_row.rfc, email = business_row.email, phone = business_row.phone,
        contact = business_row.contact, street = business_row.street,
        exterior = business_row.exterior, interior = business_row.interior,
        neighborhood = business_row.neighborhood, city = business_row.city,
        state = business_row.state, postal_code = business_row.postal_code,
        country = business_row.country, notes = business_row.notes
      where id = business_row.id;
      imported_businesses := imported_businesses + 1;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'links') loop
    insert into public.business_clients (business_id, client_id)
      values (item->>'business_id', item->>'client_id') on conflict do nothing;
    get diagnostics affected = row_count;
    imported_links := imported_links + affected;
  end loop;

  return jsonb_build_object('clients', imported_clients, 'businesses', imported_businesses, 'links', imported_links);
end;
$$;

revoke all on function public.import_local_catalogs(jsonb) from public, anon;
grant execute on function public.import_local_catalogs(jsonb) to authenticated;

commit;
