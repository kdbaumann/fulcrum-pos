-- ============================================================================
-- Fulcrum — Step 2, Milestone 1b: platform accounts + marketplace foundation
-- Additive migration. Apply AFTER 0001_init.sql.
--
-- Adds: account types (vendor/collector), user profiles, platform admins,
-- configurable plans + subscriptions (with a free-tier inventory cap),
-- marketplace-ready columns + want lists + cross-account offers, and a
-- cross-population listing browser. Connection-first; payment facilitation
-- (Stripe Connect/commission/tax) comes in a later migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Account type on organizations
-- ---------------------------------------------------------------------------
create type org_type as enum ('vendor','collector');

alter table organizations
  add column if not exists type               org_type not null default 'vendor',
  add column if not exists ein                text,           -- vendors only; collected just-in-time
  add column if not exists stripe_customer_id text,           -- subscription billing
  add column if not exists stripe_connect_id  text;           -- future: marketplace payouts

-- ---------------------------------------------------------------------------
-- User profiles (PII; minimal at signup, enriched just-in-time)
-- ---------------------------------------------------------------------------
create table profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  address     jsonb,                 -- {line1,line2,city,state,postal,country}
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Platform admins (the superuser; seeded once after signup — see README)
-- ---------------------------------------------------------------------------
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Plans (platform-admin configurable) + subscriptions
-- ---------------------------------------------------------------------------
create table plans (
  key            text primary key,           -- collector_free, vendor_pro, ...
  audience       org_type not null,
  name           text not null,
  price_cents    integer not null default 0,
  max_inventory  integer,                     -- null = unlimited
  max_seats      integer not null default 1,
  marketplace_fee_pct numeric not null default 8,
  features       jsonb not null default '{}',
  sort           integer not null default 0
);

insert into plans (key, audience, name, price_cents, max_inventory, max_seats, marketplace_fee_pct, sort) values
  ('collector_free',  'collector', 'Collector Free', 0,     100,  1, 8, 10),
  ('collector_plus',  'collector', 'Collector Plus', 700,   null, 1, 5, 20),
  ('vendor_starter',  'vendor',    'Vendor Starter', 2900,  null, 2, 6, 30),
  ('vendor_pro',      'vendor',    'Vendor Pro',     7900,  null, 5, 4, 40),
  ('vendor_elite',    'vendor',    'Vendor Elite',   19900, null, 25, 3, 50)
on conflict (key) do nothing;

create table subscriptions (
  org_id               uuid primary key references organizations(id) on delete cascade,
  plan_key             text not null references plans(key),
  status               text not null default 'active',  -- active|past_due|canceled|trialing
  stripe_subscription_id text,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Marketplace-ready columns + want lists + cross-account offers
-- ---------------------------------------------------------------------------
alter table inventory_items
  add column if not exists listed         boolean not null default false,
  add column if not exists list_price     numeric,
  add column if not exists open_to_offers boolean not null default false;  -- discoverable while unlisted

create table want_lists (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  game        text,
  set_code    text,
  number      text,
  name        text,
  max_price   numeric,
  note        text,
  created_at  timestamptz not null default now()
);
create index on want_lists(org_id);

-- offers can now originate from another account (vendor->vendor, vendor->collector, ...)
alter table offers
  add column if not exists buyer_org_id uuid references organizations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Replace create_org to set type + provision a default subscription
-- ---------------------------------------------------------------------------
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

grant execute on function create_org(text, text, org_type) to authenticated;
grant execute on function is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Free-tier inventory cap (configurable via plans.max_inventory)
-- Applies to collector orgs; vendors are uncapped unless their plan says so.
-- ---------------------------------------------------------------------------
create or replace function enforce_inventory_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer;
begin
  -- effective cap = the org's plan cap, falling back to collector_free if no sub row
  select coalesce(p.max_inventory, null) into cap
    from subscriptions s join plans p on p.key = s.plan_key
    where s.org_id = NEW.org_id;
  if not found then
    select max_inventory into cap from plans where key = 'collector_free';
  end if;
  if cap is null then return NEW; end if;  -- unlimited
  if (select count(*) from inventory_items where org_id = NEW.org_id) >= cap then
    raise exception 'Plan inventory cap reached (% items). Upgrade to add more.', cap
      using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_inventory_cap on inventory_items;
create trigger trg_inventory_cap before insert on inventory_items
  for each row execute function enforce_inventory_cap();

-- ---------------------------------------------------------------------------
-- Cross-population listing browser (authenticated users; safe fields only)
-- ---------------------------------------------------------------------------
create or replace function browse_listings(p_query text default null, p_game text default null)
returns table (
  inventory_id uuid, code text, name text, game text, set_code text, number text,
  rarity text, variation text, condition card_condition, grade text,
  list_price numeric, seller_type org_type, seller_name text, seller_slug text
)
language sql stable security definer set search_path = public as $$
  select i.id, i.code, c.name, c.game, c.set_code, c.number, c.rarity, c.variation,
         i.condition, i.grade, coalesce(i.list_price, i.asking_price),
         o.type, o.name, o.slug
  from inventory_items i
  join organizations o on o.id = i.org_id
  left join cards c on c.id = i.card_id
  where i.listed = true
    and i.status in ('available','at_show')
    and (p_game is null or c.game = p_game)
    and (p_query is null or c.name ilike '%'||p_query||'%' or i.code ilike '%'||p_query||'%');
$$;

grant execute on function browse_listings(text, text) to authenticated;

-- ============================================================================
-- RLS for the new tables
-- ============================================================================
alter table profiles        enable row level security;
alter table platform_admins enable row level security;
alter table plans           enable row level security;
alter table subscriptions   enable row level security;
alter table want_lists      enable row level security;

-- profiles: a user manages only their own row (admins read via is_platform_admin)
create policy profile_self on profiles for all
  using (user_id = auth.uid() or is_platform_admin())
  with check (user_id = auth.uid());

-- platform_admins: self/admin can read; inserts happen via SQL editor / service role only
create policy padmin_read on platform_admins for select
  using (user_id = auth.uid() or is_platform_admin());

-- plans: any signed-in user can read; only platform admin can change
create policy plans_read  on plans for select to authenticated using (true);
create policy plans_write on plans for all using (is_platform_admin()) with check (is_platform_admin());

-- subscriptions: org members (or admin) read; admin writes (Stripe webhooks use service role)
create policy subs_read  on subscriptions for select using (is_member(org_id) or is_platform_admin());
create policy subs_write on subscriptions for all using (is_platform_admin()) with check (is_platform_admin());

-- want_lists: org members manage their own
create policy want_member_all on want_lists for all using (is_member(org_id)) with check (is_member(org_id));

-- offers: in addition to seller-org members (policy from 0001), let the BUYER org see offers it made
create policy offers_buyer_select on offers for select
  using (buyer_org_id is not null and is_member(buyer_org_id));
