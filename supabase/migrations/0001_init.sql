-- ============================================================================
-- Fulcrum POS — Step 2 backend, Milestone 1
-- Multi-tenant Postgres schema + Row-Level Security for Supabase.
--
-- Design notes:
--  * Every business row carries org_id. RLS restricts access to orgs the
--    signed-in user belongs to (via the memberships table).
--  * Human-friendly codes (FC-000123, TX-000045, BOX-0147) are stored as
--    `code` columns, unique per org. Primary keys are uuids.
--  * The public customer QR page reads ONLY safe fields via a SECURITY DEFINER
--    function (public_item), so anonymous visitors never see cost/min price.
-- Apply with:  supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role        as enum ('owner','operator');
create type inventory_status   as enum ('available','reserved','at_show','sold','sold_pending_fulfillment');
create type value_tier         as enum ('bulk','standard','premium','elite');
create type location_kind      as enum ('box','binder','case','warehouse','show');
create type card_condition     as enum ('NM','LP','MP','HP','DMG','GRADED');
create type payment_method     as enum ('cash','card','venmo','paypal','zelle','other');
create type offer_status       as enum ('pending','accepted','countered','declined','expired');
create type fulfillment_stage  as enum ('pending','pulled','shipped');
create type batch_status       as enum ('open','committed','discarded');

-- ---------------------------------------------------------------------------
-- Tenancy: organizations + memberships
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,           -- used in public QR URLs: /i/:slug/:code
  created_at  timestamptz not null default now()
);

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        member_role not null default 'operator',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships(user_id);

-- helper: is the current user a member of this org?
create or replace function is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

-- helper: is the current user an OWNER of this org?
create or replace function is_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- Settings (one row per org)
-- ---------------------------------------------------------------------------
create table settings (
  org_id                       uuid primary key references organizations(id) on delete cascade,
  business_name                text not null default 'My Card Shop',
  public_base_url              text not null default '',
  default_operator             text not null default 'Owner',
  default_tax_rate             numeric not null default 0,
  tiers                        jsonb not null default '[]',   -- editable value-tier thresholds
  pull_up_bulk_over            numeric not null default 10,
  pull_up_standard_over        numeric not null default 50,
  offer_auto_decline_below_pct numeric not null default 60,
  high_value_alert_over        numeric not null default 250,
  last_priced_at               timestamptz
);

-- ---------------------------------------------------------------------------
-- Catalog + inventory
-- ---------------------------------------------------------------------------
create table cards (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  code            text not null,                 -- e.g. OP13-118
  game            text not null default '',
  set_code        text not null default '',       -- "set" is a reserved word; maps to type.set
  number          text not null default '',
  name            text not null default '',
  rarity          text not null default '',
  variation       text not null default 'Regular',
  language        text not null default 'English',
  market_price    numeric not null default 0,
  market_override boolean not null default false,
  image_url       text,
  created_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index on cards(org_id);

create table locations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  code          text not null,                   -- BOX-0147, OP-BINDER-A, CASE-A
  kind          location_kind not null,
  label         text not null default '',
  game          text,
  tier          value_tier,
  approx_count  integer,
  open_slots    integer,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index on locations(org_id);

create table inventory_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  code            text not null,                 -- FC-000123
  card_id         uuid references cards(id) on delete set null,
  cost_basis      numeric not null default 0,
  asking_price    numeric not null default 0,
  min_price       numeric,
  status          inventory_status not null default 'available',
  tier            value_tier not null default 'standard',
  location_id     uuid references locations(id) on delete set null,
  condition       card_condition not null default 'NM',
  grade           text,
  front_photo_url text,
  back_photo_url  text,
  sold_at         timestamptz,
  batch_id        uuid,
  batch_order     integer,
  notes           text,
  fulfillment     jsonb,                          -- {stage,transactionId,carrier,tracking,...}
  created_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index on inventory_items(org_id);
create index on inventory_items(card_id);
create index on inventory_items(location_id);
create index on inventory_items(org_id, status);

-- ---------------------------------------------------------------------------
-- Intake batches
-- ---------------------------------------------------------------------------
create table intake_batches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  code         text not null,                    -- BATCH-0007
  game         text not null default '',
  tier         value_tier not null default 'bulk',
  location_id  uuid references locations(id) on delete set null,
  operator     text not null default '',
  status       batch_status not null default 'open',
  created_at   timestamptz not null default now(),
  unique (org_id, code)
);
create index on intake_batches(org_id);

create table staged_cards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  batch_id      uuid not null references intake_batches(id) on delete cascade,
  card_id       uuid references cards(id) on delete set null,
  raw_name      text not null default '',
  cost_basis    numeric not null default 0,
  asking_price  numeric not null default 0,
  condition     card_condition not null default 'NM',
  exception     text,
  position      integer not null default 0       -- scan order -> label print order
);
create index on staged_cards(batch_id);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table transactions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  code            text not null,                  -- TX-000045
  asking_total    numeric not null default 0,
  sold_total      numeric not null default 0,
  discount        numeric not null default 0,
  tax_rate        numeric not null default 0,
  tax             numeric not null default 0,
  payment_method  payment_method not null default 'cash',
  location_id     uuid references locations(id) on delete set null,
  operator        text not null default '',
  customer        text,
  note            text,
  created_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index on transactions(org_id);

create table transaction_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  transaction_id  uuid not null references transactions(id) on delete cascade,
  inventory_id    uuid references inventory_items(id) on delete set null,
  card_id         uuid references cards(id) on delete set null,
  description     text not null default '',
  asking_price    numeric not null default 0,
  allocated_price numeric not null default 0,
  cost_basis      numeric not null default 0
);
create index on transaction_lines(transaction_id);

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
create table offers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  code           text not null,                   -- OFFER-000007
  inventory_id   uuid references inventory_items(id) on delete set null,
  card_id        uuid references cards(id) on delete set null,
  amount         numeric not null,
  counter_amount numeric,
  customer_name  text not null default '',
  contact        text,
  status         offer_status not null default 'pending',
  checkout_token text,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (org_id, code)
);
create index on offers(org_id, status);

-- ---------------------------------------------------------------------------
-- Shows + pull rules
-- ---------------------------------------------------------------------------
create table shows (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  code         text not null,                     -- SHOW-DALLAS-2026
  name         text not null default '',
  location_id  uuid references locations(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (org_id, code)
);

create table pull_rules (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  show_id    uuid not null references shows(id) on delete cascade,
  label      text not null default '',
  game       text,
  tier       value_tier,
  min_price  numeric,
  max_price  numeric,
  grade      text,
  rarity     text
);
create index on pull_rules(show_id);

-- ---------------------------------------------------------------------------
-- Notifications, search misses, price history
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on notifications(org_id, read);

create table search_misses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  term        text not null,
  count       integer not null default 1,
  last_at     timestamptz not null default now(),
  unique (org_id, term)
);

create table price_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  price       numeric not null,
  source      text not null default 'manual',
  recorded_at timestamptz not null default now()
);
create index on price_history(card_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Per-org code counters (FC-000123, TX-000045, ...) — atomic via upsert
-- ---------------------------------------------------------------------------
create table counters (
  org_id  uuid not null references organizations(id) on delete cascade,
  kind    text not null,                          -- 'inventory' | 'transaction' | 'batch' | 'offer'
  value   bigint not null default 0,
  primary key (org_id, kind)
);

-- returns the next integer for (org, kind), incrementing atomically
create or replace function next_counter(p_org uuid, p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not is_member(p_org) then raise exception 'not a member of org %', p_org; end if;
  insert into counters(org_id, kind, value) values (p_org, p_kind, 1)
    on conflict (org_id, kind) do update set value = counters.value + 1
    returning value into v;
  return v;
end; $$;

-- ---------------------------------------------------------------------------
-- Org creation: make an org + owner membership + default settings atomically
-- ---------------------------------------------------------------------------
create or replace function create_org(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  insert into organizations(name, slug) values (p_name, p_slug) returning id into new_org;
  insert into memberships(org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into settings(org_id, business_name, public_base_url) values (new_org, p_name, '');
  return new_org;
end; $$;

-- ---------------------------------------------------------------------------
-- Public customer QR view — anon-safe fields only (no cost/min price)
-- ---------------------------------------------------------------------------
create or replace function public_item(p_slug text, p_code text)
returns table (
  code text, name text, game text, set_code text, number text, rarity text,
  variation text, language text, condition card_condition, grade text,
  asking_price numeric, status inventory_status, front_photo_url text,
  business_name text
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

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table organizations    enable row level security;
alter table memberships      enable row level security;
alter table settings         enable row level security;
alter table cards            enable row level security;
alter table locations        enable row level security;
alter table inventory_items  enable row level security;
alter table intake_batches   enable row level security;
alter table staged_cards     enable row level security;
alter table transactions     enable row level security;
alter table transaction_lines enable row level security;
alter table offers           enable row level security;
alter table shows            enable row level security;
alter table pull_rules       enable row level security;
alter table notifications    enable row level security;
alter table search_misses    enable row level security;
alter table price_history    enable row level security;
alter table counters         enable row level security;

-- organizations: members can read; owners can update; insert handled by create_org()
create policy org_select on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_owner(id));

-- memberships: a user sees memberships of orgs they belong to; owners manage them
create policy mem_select on memberships for select using (is_member(org_id));
create policy mem_write  on memberships for all using (is_owner(org_id)) with check (is_owner(org_id));

-- settings: members read; owners write
create policy set_select on settings for select using (is_member(org_id));
create policy set_write  on settings for all using (is_owner(org_id)) with check (is_owner(org_id));

-- Generic per-org tables: any member of the org may read/write their org's rows.
-- (Tighten to owner-only later for specific operations if desired.)
do $$
declare t text;
begin
  foreach t in array array[
    'cards','locations','inventory_items','intake_batches','staged_cards',
    'transactions','transaction_lines','offers','shows','pull_rules',
    'notifications','search_misses','price_history','counters'
  ]
  loop
    execute format(
      'create policy %1$s_member_all on %1$s for all using (is_member(org_id)) with check (is_member(org_id));',
      t
    );
  end loop;
end $$;

-- Allow anonymous + authenticated to call the public customer view only.
grant execute on function public_item(text, text) to anon, authenticated;
grant execute on function create_org(text, text)  to authenticated;
grant execute on function next_counter(uuid, text) to authenticated;
