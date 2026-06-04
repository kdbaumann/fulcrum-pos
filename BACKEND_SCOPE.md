# Fulcrum POS — Backend & Integrations Scope (Step 2)

## Why this step exists

Phase 1–3 are built as a **browser-only app**: all data lives in each device's
localStorage, and the "external" pieces (live pricing, shipping labels, email/SMS,
QuickBooks, online card payments) are **simulated**. That's great for a demo and for a
single laptop at one table — but it can't:

- sync inventory across phone + tablet + laptop (or between you and an employee),
- be a reliable system of record,
- take real online payments, print real shipping labels, send real alerts, or pull
  real market prices.

Step 2 adds a **shared backend** so the existing UI keeps working but reads/writes a
real database, with auth, roles, and real third-party integrations.

---

## Recommended architecture

Keep the React SPA on Netlify. Add a backend-as-a-service so we write very little
server code and get auth + database + realtime + file storage out of the box.

| Concern | Recommendation | Why |
|---|---|---|
| Database | **Supabase (Postgres)** | Real relational DB matching our data model; row-level security for roles/multi-dealer; generous free tier |
| Auth | **Supabase Auth** | Email magic-link / password / Google; integrates with row-level security |
| Realtime sync | **Supabase Realtime** | Inventory/cart/offers update live across devices |
| File storage | **Supabase Storage** | Card front/back photos (Elite tier) |
| Server logic | **Supabase Edge Functions** + **Netlify Scheduled Functions** | Webhooks, label creation, QuickBooks sync, and cron jobs (daily pricing, pull-up) |
| Hosting | **Netlify (unchanged)** | Already set up; SPA + env vars + deploy-on-push |

> Alternatives if you'd rather not use Supabase: Neon/PlanetScale (DB) + Clerk/Auth0
> (auth) + Netlify Functions. More moving parts; I recommend Supabase for speed.

### How the app changes

- Replace the localStorage store (`src/lib/store.tsx`) with an **API/data layer** that
  calls Supabase. The UI components barely change — the store was deliberately isolated
  for exactly this swap.
- Add a **login screen** and load the signed-in dealer's data.
- The public QR page (`/i/:id`) reads **only customer-safe fields** via a public view —
  never cost basis / min price.

---

## Data model → Postgres

The TypeScript types in `src/types.ts` map almost 1:1 to tables. Every row gets a
`dealer_id` (or `org_id`) so multiple dealers/employees are isolated by row-level security:

```
organizations            settings (per org)
users / memberships      cards (Card Master)
locations                inventory_items
intake_batches           staged_cards
transactions             transaction_lines
offers                   shows / pull_rules
notifications            search_misses
price_history            fulfillment (or columns on inventory_items)
```

Roles (`owner`, `operator`) live on `memberships`; RLS policies enforce who can read/write
what, and the UI gating we already built mirrors it.

---

## Integrations — what each needs

| Capability | Service (recommended) | What you must provide / sign up for | Notes |
|---|---|---|---|
| **Online card payments + Buy Now / offer checkout** | **Stripe** | Stripe account (business details, bank for payouts) | Industry standard; hosted checkout = minimal PCI scope |
| **In-person card payments** | **Stripe Terminal** (optional) | Terminal card reader hardware (~$60–$300) | Only if you want to swipe at shows; otherwise keep recording cash/Venmo/Zelle manually |
| **Shipping labels + tracking** | **EasyPost** or **Shippo** | Account + (your) USPS/UPS/FedEx; pay per label | One API for all carriers — much simpler than per-carrier APIs |
| **Email alerts/receipts** | **Resend** or **SendGrid** | Account + verify your sending domain (DNS) | Cheap/free at low volume |
| **SMS alerts** | **Twilio** | Account + a phone number; pay per message | Optional; email may be enough at first |
| **Market pricing — TCGplayer** | TCGplayer API | **Partner/API approval** (can take time, may require a storefront) | Access is gated; this is the biggest unknown |
| **Market pricing — eBay sold comps** | eBay Browse / Marketplace Insights API | eBay developer account + app keys | Good for sold-price comps |
| **Market pricing — PriceCharting / SportsCardsPro** | PriceCharting API | Paid API subscription | Easiest to start with; good slab/graded coverage |
| **Accounting** | **QuickBooks Online API** | QuickBooks Online subscription + developer app | Start with the CSV export we already have; add live sync later |

For pricing specifically: I'd start with **one** source (PriceCharting is the easiest to
get) plus **manual overrides** (already built), and add TCGplayer/eBay once their access
is approved. The daily pricing job and pull-up job already exist — they just need a real
data feed wired in behind them.

---

## Offline at shows (important, and not free)

Convention-center wifi is unreliable, so the app should keep working offline and sync
when it reconnects. That means a **PWA** with a local cache (IndexedDB) and a
**sync queue** that reconciles with Supabase. This is real engineering — it's the single
biggest line item after auth/DB. We can ship Step 2 online-only first and add offline
sync as Step 2.5 if you want to keep momentum.

---

## Suggested build order

1. **Foundation** — Supabase project, schema + RLS, auth/login, migrate the store to the
   API, realtime sync across devices. *(Everything else depends on this.)*
2. **Payments** — Stripe online checkout for Buy Now + accepted offers; (optional) Terminal.
3. **Pricing engine** — wire one real source + scheduled daily job + pull-up job.
4. **Fulfillment** — EasyPost labels + tracking on the fulfillment screen.
5. **Notifications** — email (and optional SMS) on the events we already emit in-app.
6. **Accounting** — QuickBooks Online sync (CSV export already works in the meantime).
7. **Offline PWA sync** *(optional / can defer)*.

Each is independently shippable, so you get value after every step rather than waiting
for a big-bang release.

---

## Rough running costs (low volume, monthly)

- Supabase: **$0** (free tier) → **~$25** as you grow
- Netlify: **$0** on current usage
- Stripe: **no monthly fee**, ~2.9% + 30¢ per online charge
- EasyPost/Shippo: **per label** (carrier cost + small fee)
- Email: **$0–$20**; Twilio SMS: **~1¢/msg**
- PriceCharting API: **paid subscription** (varies); TCGplayer/eBay: free keys, gated access
- QuickBooks Online: your existing subscription

Ballpark fixed software cost early on: **under ~$50/month** plus per-transaction payment
and per-label shipping fees.

---

## Locked decisions (2026-06-04)

1. **Multi-dealer SaaS** — build multi-tenant from day one: `org_id` on every row,
   row-level security, and staff **invitations** under each dealer org.
2. **Payments** — Stripe for cards + digital wallets (**Apple Pay / Google Pay**),
   **Venmo** via PayPal/Braintree, and keep recording **Zelle / CashApp / cash** manually.
   (See the Tap-to-Pay caveat below.)
3. **Pricing** — wire **PriceCharting** first; add TCGplayer/eBay once approved.
4. **Offline-at-shows** — **must-have** in the first release: PWA + local store + sync queue.

### ⚠️ Payments caveat — "tap" in person vs. online wallets

These are two different things and one needs a native app:

- **Apple Pay / Google Pay as a checkout button** (customer pays online, or on your device's
  browser) — ✅ works in the web PWA via Stripe. No hardware.
- **Venmo** — ✅ can be a real online checkout method via **PayPal/Braintree**. Zelle and
  CashApp have **no merchant charge API**, so those stay manual records (as today).
- **Accepting a contactless TAP from a customer's card/phone, in person** — ❌ a pure web
  PWA **cannot** do this. Two real options:
  - **Tap to Pay on iPhone** (no extra hardware) — requires a **thin native iOS app** using
    Stripe's iOS SDK. This conflicts slightly with "web-only PWA," so it'd be a small
    companion app that signs into the same backend.
  - **Stripe Terminal reader** (hardware, ~$60–300) — works from the web app, no native app.

  **Recommendation:** ship v2 with Apple/Google Pay + Venmo online + manual virtual methods,
  and pick Tap-to-Pay-on-iPhone (native companion) **or** a Terminal reader for in-person
  contactless as a fast follow. **This is the one open decision left.**

---

## Revised plan given the locked decisions

Multi-tenant + offline-first both land in the **Foundation** milestone, so it's the
largest piece. Realistic sizing (rough, relative):

| # | Milestone | Includes | Size |
|---|---|---|---|
| 1 | **Foundation** | Supabase project; multi-tenant schema + RLS; auth + staff invites; migrate store to API; **PWA + IndexedDB offline cache + sync queue + conflict handling**; realtime sync | **L (largest)** |
| 2 | **Payments** | Stripe online checkout (Buy Now + accepted offers) with Apple/Google Pay; Venmo via Braintree; manual methods unchanged | M |
| 3 | **Pricing** | PriceCharting feed behind the existing daily + pull-up jobs (scheduled functions) | S–M |
| 4 | **Fulfillment** | EasyPost labels + tracking on the fulfillment screen | S–M |
| 5 | **Notifications** | Email (Resend) + optional SMS (Twilio) on events we already emit | S |
| 6 | **Accounting** | QuickBooks Online sync (CSV export covers the gap until then) | M |
| 7 | **In-person contactless** | Tap to Pay on iPhone (native companion) **or** Stripe Terminal | M |

### Accounts / procurement checklist to start Milestone 1–2
- [ ] **Supabase** project (free tier to start)
- [ ] **Stripe** account (business + bank for payouts); enable Apple/Google Pay
- [ ] **PayPal/Braintree** account (for Venmo) — optional, can defer
- [ ] **PriceCharting** API subscription
- [ ] **EasyPost** (or Shippo) account — for Milestone 4
- [ ] **Resend** + verify sending domain; **Twilio** number if SMS — for Milestone 5
- [ ] **QuickBooks Online** developer app — for Milestone 6
- [ ] Decide in-person contactless path (Tap to Pay native app vs Terminal hardware)
- [ ] Apple Developer account **only if** we go Tap-to-Pay-on-iPhone
