# Supabase backend — setup

Milestone 1 of the Step 2 backend (see `../BACKEND_SCOPE.md`). This folder holds the
database schema; the app's data layer is wired to it in the following sub-steps.

## 1. Create the project
1. Sign up at https://supabase.com and create a new project (free tier is fine to start).
2. Choose a region close to you; save the database password.

## 2. Apply the schema (run both migrations, in order)
**Option A — SQL editor (no tooling):** open the project → **SQL Editor** → paste the
contents of `migrations/0001_init.sql` → **Run**, then do the same for
`migrations/0002_platform.sql`.

**Option B — Supabase CLI (repeatable):**
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref zqzfypybghryogcjfzdw
supabase db push        # applies everything in supabase/migrations/ in order
```

`0002_platform.sql` adds: account types (vendor/collector), `profiles`, `platform_admins`,
configurable `plans` + `subscriptions` (free-tier inventory cap), marketplace-ready columns,
`want_lists`, cross-account offers, and the `browse_listings` discovery RPC.

### Make yourself the platform superuser (one time, after you sign up)
`platform_admins` starts empty by design. After the app's login exists and **you've signed
up once**, find your user id in **Authentication → Users**, then run in the SQL editor:
```sql
insert into platform_admins (user_id) values ('<your-auth-user-uuid>');
```
That single row makes you the platform admin. (We can wire a friendlier one-time claim later.)

## 3. Grab your keys
Project → **Settings → API**. You'll need:
- **Project URL** (e.g. `https://abcd.supabase.co`)
- **anon public key** (safe for the browser)

Add them to the app as Vite env vars (these get baked into the client build):
```
# .env.local  (and the same two in Netlify → Site settings → Environment variables)
VITE_SUPABASE_URL=https://abcd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```
> The anon key is fine to expose — Row-Level Security in the schema is what actually
> protects each dealer's data. Never put the **service_role** key in the frontend.

## 4. Enable auth
Project → **Authentication → Providers**: enable **Email** (magic link or password).
Optionally enable **Google**. Set the Site URL to your Netlify URL (and `localhost:5173`
for local dev) under **Authentication → URL Configuration**.

## 5. First org
After a user signs up, the app calls `create_org(name, slug)` once to create their
dealer organization, owner membership, and default settings. (Wired up in the next
sub-step.)

## What's in the schema (`0001_init.sql`)
- **Multi-tenant**: every table carries `org_id`; `memberships` ties users to orgs with a
  role (`owner` / `operator`).
- **Row-Level Security** on every table so a user only ever sees their org's rows; owners
  get write access to settings/memberships.
- Tables mirror `src/types.ts`: cards, inventory_items, locations, intake_batches,
  staged_cards, transactions, transaction_lines, offers, shows, pull_rules, notifications,
  search_misses, price_history.
- **`public_item(slug, code)`** — anon-safe RPC for the customer QR page (never returns
  cost basis or min price).
- **`next_counter(org, kind)`** — atomic per-org sequence for FC-/TX-/BATCH-/OFFER- codes.
- **`create_org(name, slug)`** — provisions an org + owner + settings in one call.

## Next sub-steps (Milestone 1 continued)
1. Add `@supabase/supabase-js` client + a typed data layer that mirrors the current
   `src/lib/store.tsx` Store interface.
2. Login screen + org bootstrap.
3. **Offline-first sync engine**: keep an IndexedDB cache as the UI's source of truth and a
   write queue that reconciles to Supabase on reconnect (this is the big piece).
