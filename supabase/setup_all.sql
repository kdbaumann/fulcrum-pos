-- ============================================================================
-- Fulcrum — COMBINED IDEMPOTENT SETUP (0001 + 0002)
-- Safe to run on a fresh project OR one that already has part of the schema.
-- Every object is guarded, so re-running never errors with "already exists".
-- Paste the WHOLE file into the Supabase SQL editor and Run. It ends with a
-- verification row.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- enums (guarded) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname='member_role')       then create type member_role       as enum ('owner','operator'); end if;
  if not exists (select 1 from pg_type where typname='inventory_status')  then create type inventory_status  as enum ('available','reserved','at_show','sold','sold_pending_fulfillment'); end if;
  if not exists (select 1 from pg_type where typname='value_tier')        then create type value_tier        as enum ('bulk','standard','premium','elite'); end if;
  if not exists (select 1 from pg_type where typname='location_kind')     then create type location_kind     as enum ('box','binder','case','warehouse','show'); end if;
  if not exists (select 1 from pg_type where typname='card_condition')    then create type card_condition    as enum ('NM','LP','MP','HP','DMG','GRADED'); end if;
  if not exists (select 1 from pg_type where typname='payment_method')    then create type payment_method    as enum ('cash','card','venmo','paypal','zelle','other'); end if;
  if not exists (select 1 from pg_type where typname='offer_status')      then create type offer_status      as enum ('pending','accepted','countered','declined','expired'); end if;
  if not exists (select 1 from pg_type where typname='fulfillment_stage') then create type fulfillment_stage as enum ('pending','pulled','shipped'); end if;
  if not exists (select 1 from pg_type where typname='batch_status')      then create type batch_status      as enum ('open','committed','discarded'); end if;
  if not exists (select 1 from pg_type where typname='org_type')          then create type org_type          as enum ('vendor','collector'); end if;
end $$;

-- ---------- tables ----------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table organizations
  add column if not exists type org_type not null default 'vendor',
  add column if not exists ein text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_connect_id text;

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'operator',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on memberships(user_id);

create table if not exists settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  business_name text not null default 'My Card Shop',
  public_base_url text not null default '',
  default_operator text not null default 'Owner',
  default_tax_rate numeric not null default 0,
  tiers jsonb not null default '[]',
  pull_up_bulk_over numeric not null default 10,
  pull_up_standard_over numeric not null default 50,
  offer_auto_decline_below_pct numeric not null default 60,
  high_value_alert_over numeric not null default 250,
  last_priced_at timestamptz
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  game text not null default '',
  set_code text not null default '',
  number text not null default '',
  name text not null default '',
  rarity text not null default '',
  variation text not null default 'Regular',
  language text not null default 'English',
  market_price numeric not null default 0,
  market_override boolean not null default false,
  image_url text,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists cards_org_idx on cards(org_id);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  kind location_kind not null,
  label text not null default '',
  game text, tier value_tier, approx_count integer, open_slots integer, notes text,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists locations_org_idx on locations(org_id);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  card_id uuid references cards(id) on delete set null,
  cost_basis numeric not null default 0,
  asking_price numeric not null default 0,
  min_price numeric,
  status inventory_status not null default 'available',
  tier value_tier not null default 'standard',
  location_id uuid references locations(id) on delete set null,
  condition card_condition not null default 'NM',
  grade text, front_photo_url text, back_photo_url text,
  sold_at timestamptz, batch_id uuid, batch_order integer, notes text, fulfillment jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
alter table inventory_items
  add column if not exists listed boolean not null default false,
  add column if not exists list_price numeric,
  add column if not exists open_to_offers boolean not null default false;
create index if not exists inv_org_idx on inventory_items(org_id);
create index if not exists inv_card_idx on inventory_items(card_id);
create index if not exists inv_loc_idx on inventory_items(location_id);
create index if not exists inv_org_status_idx on inventory_items(org_id, status);

create table if not exists intake_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, game text not null default '',
  tier value_tier not null default 'bulk',
  location_id uuid references locations(id) on delete set null,
  operator text not null default '', status batch_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists batches_org_idx on intake_batches(org_id);

create table if not exists staged_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references intake_batches(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  raw_name text not null default '', cost_basis numeric not null default 0,
  asking_price numeric not null default 0, condition card_condition not null default 'NM',
  exception text, position integer not null default 0
);
create index if not exists staged_batch_idx on staged_cards(batch_id);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, asking_total numeric not null default 0, sold_total numeric not null default 0,
  discount numeric not null default 0, tax_rate numeric not null default 0, tax numeric not null default 0,
  payment_method payment_method not null default 'cash',
  location_id uuid references locations(id) on delete set null,
  operator text not null default '', customer text, note text,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists tx_org_idx on transactions(org_id);

create table if not exists transaction_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  inventory_id uuid references inventory_items(id) on delete set null,
  card_id uuid references cards(id) on delete set null,
  description text not null default '', asking_price numeric not null default 0,
  allocated_price numeric not null default 0, cost_basis numeric not null default 0
);
create index if not exists txlines_tx_idx on transaction_lines(transaction_id);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, inventory_id uuid references inventory_items(id) on delete set null,
  card_id uuid references cards(id) on delete set null,
  amount numeric not null, counter_amount numeric, customer_name text not null default '',
  contact text, status offer_status not null default 'pending', checkout_token text,
  created_at timestamptz not null default now(), responded_at timestamptz,
  unique (org_id, code)
);
alter table offers add column if not exists buyer_org_id uuid references organizations(id) on delete set null;
create index if not exists offers_org_status_idx on offers(org_id, status);

create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, name text not null default '',
  location_id uuid references locations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists pull_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  show_id uuid not null references shows(id) on delete cascade,
  label text not null default '', game text, tier value_tier,
  min_price numeric, max_price numeric, grade text, rarity text
);
create index if not exists pull_show_idx on pull_rules(show_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null, message text not null, read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_org_read_idx on notifications(org_id, read);

create table if not exists search_misses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  term text not null, count integer not null default 1, last_at timestamptz not null default now(),
  unique (org_id, term)
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  price numeric not null, source text not null default 'manual', recorded_at timestamptz not null default now()
);
create index if not exists price_card_idx on price_history(card_id, recorded_at desc);

create table if not exists counters (
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null, value bigint not null default 0,
  primary key (org_id, kind)
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text, phone text, address jsonb, avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  key text primary key, audience org_type not null, name text not null,
  price_cents integer not null default 0, max_inventory integer, max_seats integer not null default 1,
  marketplace_fee_pct numeric not null default 8, features jsonb not null default '{}', sort integer not null default 0
);
insert into plans (key, audience, name, price_cents, max_inventory, max_seats, marketplace_fee_pct, sort) values
  ('collector_free','collector','Collector Free',0,100,1,8,10),
  ('collector_plus','collector','Collector Plus',700,null,1,5,20),
  ('vendor_starter','vendor','Vendor Starter',2900,null,2,6,30),
  ('vendor_pro','vendor','Vendor Pro',7900,null,5,4,40),
  ('vendor_elite','vendor','Vendor Elite',19900,null,25,3,50)
on conflict (key) do nothing;

create table if not exists subscriptions (
  org_id uuid primary key references organizations(id) on delete cascade,
  plan_key text not null references plans(key), status text not null default 'active',
  stripe_subscription_id text, current_period_end timestamptz, created_at timestamptz not null default now()
);

create table if not exists want_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  game text, set_code text, number text, name text, max_price numeric, note text,
  created_at timestamptz not null default now()
);
create index if not exists want_org_idx on want_lists(org_id);

-- ---------- functions ----------
create or replace function is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create or replace function is_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins a where a.user_id = auth.uid());
$$;

create or replace function next_counter(p_org uuid, p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not is_member(p_org) then raise exception 'not a member of org %', p_org; end if;
  insert into counters(org_id, kind, value) values (p_org, p_kind, 1)
    on conflict (org_id, kind) do update set value = counters.value + 1 returning value into v;
  return v;
end; $$;

drop function if exists create_org(text, text);
create or replace function create_org(p_name text, p_slug text, p_type org_type default 'vendor')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid; default_plan text;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  insert into organizations(name, slug, type) values (p_name, p_slug, p_type) returning id into new_org;
  insert into memberships(org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into settings(org_id, business_name, public_base_url) values (new_org, p_name, '');
  default_plan := case when p_type = 'collector' then 'collector_free' else 'vendor_starter' end;
  insert into subscriptions(org_id, plan_key) values (new_org, default_plan);
  return new_org;
end; $$;

create or replace function public_item(p_slug text, p_code text)
returns table (
  code text, name text, game text, set_code text, number text, rarity text,
  variation text, language text, condition card_condition, grade text,
  asking_price numeric, status inventory_status, front_photo_url text, business_name text
)
language sql stable security definer set search_path = public as $$
  select i.code, c.name, c.game, c.set_code, c.number, c.rarity, c.variation, c.language,
         i.condition, i.grade, i.asking_price, i.status, i.front_photo_url, s.business_name
  from inventory_items i
  join organizations o on o.id = i.org_id and o.slug = p_slug
  left join cards c on c.id = i.card_id
  left join settings s on s.org_id = i.org_id
  where i.code = p_code;
$$;

create or replace function enforce_inventory_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer;
begin
  select coalesce(p.max_inventory, null) into cap
    from subscriptions s join plans p on p.key = s.plan_key where s.org_id = NEW.org_id;
  if not found then select max_inventory into cap from plans where key='collector_free'; end if;
  if cap is null then return NEW; end if;
  if (select count(*) from inventory_items where org_id = NEW.org_id) >= cap then
    raise exception 'Plan inventory cap reached (% items). Upgrade to add more.', cap using errcode='check_violation';
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_inventory_cap on inventory_items;
create trigger trg_inventory_cap before insert on inventory_items for each row execute function enforce_inventory_cap();

create or replace function browse_listings(p_query text default null, p_game text default null)
returns table (
  inventory_id uuid, code text, name text, game text, set_code text, number text,
  rarity text, variation text, condition card_condition, grade text,
  list_price numeric, seller_type org_type, seller_name text, seller_slug text
)
language sql stable security definer set search_path = public as $$
  select i.id, i.code, c.name, c.game, c.set_code, c.number, c.rarity, c.variation,
         i.condition, i.grade, coalesce(i.list_price, i.asking_price), o.type, o.name, o.slug
  from inventory_items i
  join organizations o on o.id = i.org_id
  left join cards c on c.id = i.card_id
  where i.listed = true and i.status in ('available','at_show')
    and (p_game is null or c.game = p_game)
    and (p_query is null or c.name ilike '%'||p_query||'%' or i.code ilike '%'||p_query||'%');
$$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','memberships','settings','cards','locations','inventory_items',
    'intake_batches','staged_cards','transactions','transaction_lines','offers','shows',
    'pull_rules','notifications','search_misses','price_history','counters',
    'profiles','platform_admins','plans','subscriptions','want_lists'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

drop policy if exists org_select on organizations;
drop policy if exists org_update on organizations;
create policy org_select on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_owner(id));

drop policy if exists mem_select on memberships;
drop policy if exists mem_write on memberships;
create policy mem_select on memberships for select using (is_member(org_id));
create policy mem_write  on memberships for all using (is_owner(org_id)) with check (is_owner(org_id));

drop policy if exists set_select on settings;
drop policy if exists set_write on settings;
create policy set_select on settings for select using (is_member(org_id));
create policy set_write  on settings for all using (is_owner(org_id)) with check (is_owner(org_id));

-- generic per-org tables
do $$
declare t text;
begin
  foreach t in array array[
    'cards','locations','inventory_items','intake_batches','staged_cards',
    'transactions','transaction_lines','offers','shows','pull_rules',
    'notifications','search_misses','price_history','counters','want_lists'
  ] loop
    execute format('drop policy if exists %1$s_member_all on %1$s;', t);
    execute format('create policy %1$s_member_all on %1$s for all using (is_member(org_id)) with check (is_member(org_id));', t);
  end loop;
end $$;

drop policy if exists profile_self on profiles;
create policy profile_self on profiles for all using (user_id = auth.uid() or is_platform_admin()) with check (user_id = auth.uid());

drop policy if exists padmin_read on platform_admins;
create policy padmin_read on platform_admins for select using (user_id = auth.uid() or is_platform_admin());

drop policy if exists plans_read on plans;
drop policy if exists plans_write on plans;
create policy plans_read  on plans for select to authenticated using (true);
create policy plans_write on plans for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists subs_read on subscriptions;
drop policy if exists subs_write on subscriptions;
create policy subs_read  on subscriptions for select using (is_member(org_id) or is_platform_admin());
create policy subs_write on subscriptions for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists offers_buyer_select on offers;
create policy offers_buyer_select on offers for select using (buyer_org_id is not null and is_member(buyer_org_id));

-- ---------- grants ----------
grant execute on function public_item(text, text) to anon, authenticated;
grant execute on function create_org(text, text, org_type) to authenticated;
grant execute on function next_counter(uuid, text) to authenticated;
grant execute on function is_platform_admin() to authenticated;
grant execute on function browse_listings(text, text) to authenticated;

-- ---------- verification (returns ONE row if all is well) ----------
select 'OK — schema applied ✓' as result,
       (select count(*) from plans) as plan_count,
       exists(select 1 from information_schema.columns
              where table_name='organizations' and column_name='type') as has_type_column,
       exists(select 1 from pg_proc where proname='create_org'
              and pg_get_function_identity_arguments(oid) like '%org_type%') as has_create_org3;
