# Fulcrum — Platform Model (accounts, marketplace, monetization)

This expands the product from a single-dealer tool into a **two-sided platform**:
vendors (dealers) **and** collectors (regular users), with an internal marketplace and a
platform operator on top. This doc thinks it through so the account model we build in
Milestone 1 is right the first time.

---

## 1. Account types

Three kinds of account, one role model:

| Type | Who | What they get |
|---|---|---|
| **Platform admin (superuser)** | You — exactly one (plus optional staff later) | Oversight of all accounts, billing, marketplace, market data. Not a tenant. |
| **Vendor** | Dealers / stores | The full POS: intake, QR, locations, shows, fulfillment, POS, analytics. Can have staff seats (owner/operator). Pays the most. |
| **Collector** | Regular users | Personal **portfolio**: track cards they own, purchase price, current value; buy/sell/trade with others. Free or cheap. |

**Key modeling decision:** keep the `organizations` + `memberships` machinery we already
built and add `organizations.type ∈ (vendor, collector, platform)`. A **collector is just
an org of type `collector` with a single owner member** — so all the existing Row-Level
Security, inventory, and offer plumbing is reused instead of duplicated. A vendor org can
invite staff; a collector org is a party of one.

`platform_admin` is **not** an org — it's a tiny `platform_admins(user_id)` table + an
`is_platform_admin()` check that grants cross-org read for oversight/support.

---

## 2. What we store about people

- **`profiles`** (per user): full name, phone, email, mailing address, avatar. Required for
  shipping and for marketplace trust.
- **Vendor org fields**: business name, **EIN/Tax ID**, business address, resale cert (later),
  Stripe Connect account id, subscription/plan.
- **Collector org fields**: usually just the person (no EIN); optional shipping address;
  Stripe customer id, plan.
- **Billing**: a `subscriptions` record per org (plan, status, Stripe ids) + `invoices`.

> **Collect the minimum at signup** to reduce friction (name + email + account type), then
> ask for address/EIN/payment only when a feature needs it (first sale, first payout, first
> shipment). Storing EIN + PII brings data-security obligations — we keep secrets server-side
> and never expose them through the public API.

---

## 3. Collector portfolio (reuses the inventory model)

A collector's "collection" is just `inventory_items` under their collector org:
- `cost_basis` = **what they paid** (private to them — never shown to others, just like a
  vendor's cost basis).
- Current value comes from the **same Card Master market price** the pricing engine maintains
  for vendors — so a collector's portfolio value updates automatically alongside vendor data.
- Portfolio analytics for free/cheap: total value, gain/loss vs. cost, movers, by set/game.

This is the **flywheel**: every collector who logs a card with a purchase price adds a real
transaction data point, which sharpens market values for *everyone* (and becomes a dataset
with future value).

---

## 4. Internal marketplace + cross-population discovery

Three building blocks on top of inventory:

1. **Listings** — any account can mark an item *listed for sale / open to trade* with a
   `list_price`. Listings are discoverable across the whole platform (vendors **and**
   collectors). Private fields (cost basis, min price) are **never** exposed — only the
   public-safe fields (card, condition/grade, list price, seller type, rough region).
2. **Want lists** — any account records cards they're hunting (with a max price). The system
   **matches want lists against held inventory across the entire population** — this is your
   "find hard-to-find cards within the user base" feature.
3. **Cross-account offers** — extend the existing `offers` so a buyer (vendor **or**
   collector) can offer on a listed item **or** on a *held-but-unlisted* card whose owner has
   opted in to being contacted. So a vendor can reach out to a collector (or another vendor)
   to buy a specific card. Seller chooses Accept / Counter / Decline, same flow we built.

**Privacy model (who sees what):**

| Field | Owner | Other users / vendors | Platform admin |
|---|---|---|---|
| Card identity, condition, **list price** (if listed) | ✓ | ✓ (listed only) | ✓ |
| Cost basis / purchase price, min price | ✓ | ✗ | ✓ (oversight) |
| Exact address / contact | ✓ | ✗ (revealed only after a deal) | ✓ |
| "I hold this card" (for unlisted) | ✓ | only if owner opted into discovery | ✓ |

Contactability is **opt-in**: a collector can keep a private portfolio, or flip on "open to
offers" to surface in discovery.

---

## 5. Monetization

Two revenue streams that reinforce each other:

### A. Subscriptions (Stripe Billing)
*(Illustrative pricing — to validate, not final.)*

| Plan | Audience | ~Price | Gated value |
|---|---|---|---|
| **Collector Free** | Casual users | $0 | Track up to ~250 cards, see market values, receive offers, basic portfolio |
| **Collector Plus** | Active collectors | ~$5–9/mo | Unlimited cards, list to sell/trade, full portfolio analytics, lower marketplace fee, want-list alerts |
| **Vendor Starter** | Solo / part-time dealers | ~$29/mo | Core POS, intake, QR, 1 location, manual pricing, CSV accounting |
| **Vendor Pro** | Active dealers | ~$79/mo | Multi-location, shows + fulfillment, staff seats, live pricing feed, QuickBooks, lower fee |
| **Vendor Elite** | High-volume / stores | ~$199/mo | Everything, more seats, priority pricing/integrations, API |

### B. Marketplace commission
A platform fee on completed internal sales (e.g., **3–8%**, lower for paid tiers). This is
where collector volume pays off even though collectors are free/cheap — they create
**liquidity and data**, and transactions monetize directly.

### Why this shape
- **Vendors pay most** — they extract operational value (running a business on it).
- **Collectors are cheap/free on purpose** — they're the data + liquidity engine; a low
  barrier maximizes the population, which makes discovery and market data valuable, which in
  turn makes the vendor product better. The collector dataset is itself a long-term asset.

---

## 6. Realities to plan for (honest flags)

Running an internal marketplace where money changes hands is a meaningful step up:

- **Payments/payouts** → use **Stripe Connect** so funds flow buyer → seller and we take a
  fee, **without us becoming a money transmitter** or holding funds.
- **Sales tax** → "marketplace facilitator" laws may obligate the platform to collect/remit
  sales tax once we facilitate sales. Needs a tax service (e.g., Stripe Tax) before scaling.
- **1099-K reporting** for sellers over IRS thresholds.
- **Trust & safety** → card authenticity, shipping proof, dispute/refund handling, fraud,
  ratings. Start small (connection-first, see phasing) to defer this.
- **Data security** → PII + EIN means encryption-at-rest (Supabase default), least-privilege,
  and never exposing secrets via the public API.

---

## 7. Recommended phasing (so this doesn't stall Milestone 1)

1. **Accounts foundation (now)** — add `type` to orgs, `profiles`, `platform_admins`,
   `subscriptions`; signup flow that branches vendor vs collector; minimal PII. *Build this
   into M1 login so we don't redo it.*
2. **Vendor SaaS** — finish the backend wiring we already planned (data layer + offline sync).
3. **Collector portfolio** — collector signup + collection tracking + portfolio value.
4. **Discovery (connection-first)** — listings + want lists + cross-account offers, where
   **parties settle the deal themselves** (no platform payments yet). Low regulatory load,
   proves demand, starts generating market data.
5. **Subscriptions** — Stripe Billing + the plan gates above.
6. **Facilitated marketplace** — Stripe Connect payments, escrow-ish flow, sales tax, 1099-K,
   trust & safety. The big one; do it once demand is proven.

Steps 1–4 are very achievable and give you the platform + data flywheel; step 6 is a
deliberate later investment.

---

## 8. Locked decisions (2026-06-04)

1. **All three account types now** — vendor, collector, platform admin baked into the schema
   and signup so auth isn't re-architected later.
2. **Marketplace: facilitated payments is the target (updated 2026-06-04).** Go straight for
   Stripe Connect + commission + tax rather than connection-first. The off-app groundwork
   (entity, Connect onboarding, tax registration, legal/T&S) runs **in parallel** with app
   development and gates go-live. Full scope in `MARKETPLACE_PAYMENTS.md`.
3. **Collectors freemium with a configurable cap.** Free tier limited to ~**100 inventory
   items** (the cap lives in a `plans` table so the platform admin can change it per plan);
   paid **Plus** lifts the cap + unlocks power features. Marketplace commission on top.
4. **Minimal + just-in-time PII.** Name + email + account type at signup; address/EIN/payment
   collected only when a feature needs it.

> **Off-app checklist before facilitated payments (decision #2) can launch:** form the
> business entity, complete Stripe Connect platform onboarding, register for sales-tax
> collection (or enable Stripe Tax), set 1099-K handling, and publish marketplace/T&S +
> refund/dispute policies. None of this blocks connection-first launch.
