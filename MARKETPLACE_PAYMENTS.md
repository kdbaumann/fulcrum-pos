# Fulcrum — Facilitated Marketplace Payments (scope)

Decision (2026-06-04): build toward **facilitated payments** — the platform processes
buyer→seller transactions, takes a commission, and handles tax/reporting — rather than
connection-first. This doc is the honest scope: what the app does, what **you** must do
outside the app, and the decisions that shape it.

> Reality check: the *code* is the smaller half. The larger half is legal/compliance/ops
> work that only you can do, some with multi-week lead time. None of it blocks the login or
> vendor/collector features we build next — so we build the app while this groundwork runs
> in parallel, and flip payments on once both are ready.

---

## Recommended architecture: Stripe Connect

Stripe Connect is purpose-built for marketplaces and keeps us from becoming a money
transmitter (funds settle through Stripe, not our bank).

- **Connected accounts: Express** (recommended) — Stripe hosts seller onboarding and does the
  identity/KYC + bank collection. Sellers (vendors *and* collectors who sell) complete a
  Stripe-hosted onboarding once; payouts are blocked until they do. Least liability, fastest.
- **Money flow — two viable models:**
  - **Destination charges + application fee** (simpler): buyer pays, our commission is the
    `application_fee_amount`, the remainder routes to the seller's connected account. Faster,
    least funds-handling exposure.
  - **Separate charges & transfers / delayed payout** (buyer protection / "escrow-like"):
    capture buyer funds, hold until the buyer confirms receipt (or a window elapses), then
    transfer to the seller. Better for high-value cards + authenticity disputes, but more
    complex and means we control held funds (more compliance scrutiny).
- **Sales tax:** enable **Stripe Tax**. As a marketplace facilitator we likely must
  calculate/collect/remit in many states once volume crosses thresholds — requires tax
  registration where we have nexus.
- **1099-K:** let **Stripe Connect** generate/file 1099-Ks for connected sellers.
- **Disputes/chargebacks:** with destination charges the platform can be liable; we need a
  refund/dispute policy and possibly a reserve. Express pushes most KYC risk to Stripe.

---

## What the app will build (a later milestone, after login + listings)

- `connect_accounts` (org_id, stripe_account_id, onboarding_status, payouts_enabled) +
  a "Set up payouts" onboarding link flow.
- **Orders**: `orders`, `order_items`, `payments` (PaymentIntent), `transfers`/`payouts`,
  and a `ledger` recording commission per sale.
- **Checkout**: buyer pays for a listing/accepted-offer via Stripe; commission auto-taken.
- **Webhooks** (Supabase Edge / Netlify function) to mark orders paid, record payouts,
  handle disputes, and update inventory status → `sold` / shipping → fulfillment.
- Ties into the **fulfillment** + **shipping label** features we already designed.

---

## What YOU must do outside the app (start the lead-time items now)

- [ ] **Form a business entity** (LLC/corp) — required to open the Stripe platform account.
- [ ] **Business bank account.**
- [ ] **Apply for Stripe Connect** as a platform and complete platform verification
      (can take time — start early).
- [ ] **Sales tax**: identify nexus, register in required states, enable **Stripe Tax**.
- [ ] **Legal docs** (use a lawyer): Marketplace Terms, **Seller Agreement**, Refund/Dispute
      policy, Privacy Policy, acceptable-use.
- [ ] **1099-K** handling confirmed via Stripe; collect seller tax info at payout onboarding.
- [ ] **Trust & safety policy**: authenticity expectations, prohibited items, dispute SLA,
      shipping/tracking requirement, seller ratings.
- [ ] **Consult a payments/tax attorney** about marketplace-facilitator + (if we ever hold
      funds) money-transmission exposure for your states.
- [ ] **Fraud/chargeback reserve** plan.

---

## Locked decisions (2026-06-04)

1. **Connected-account type: Express.** Commission is taken invisibly as an
   `application_fee_amount` (works in Express *and* Standard), but Express is easier
   long-term for both vendors and collectors (Stripe-hosted onboarding, KYC, and 1099-K; no
   separate full Stripe account to manage) and keeps our fee least visible. Offer Standard
   later for large vendors who want to own their Stripe relationship.
2. **Hybrid money flow:**
   - **In-person** (store / show / street) → **immediate** charge + transfer; order closed at
     point of sale.
   - **Online / mailed** → **escrow-style hold**: capture buyer funds, seller ships + enters
     **tracking** (via the EasyPost shipping integration), auto-**release to seller on
     delivered status** (or after a safety window / buyer confirmation); a dispute pauses the
     release.
   - Implemented as an order `flow_type ∈ (instant, escrow)` driving a state machine:
     `paid → [instant: released] | [escrow: held → shipped(tracking) → delivered → released]`,
     with auto-release timer + dispute hold.
3. **Who can sell: vendors *and* collectors.** Collectors selling personal cards drive
   liquidity + data; Stripe handles their KYC/1099-K via Express.
4. **Build order: app now, off-app groundwork in parallel.**

Escrow means the platform briefly **controls held funds** — the standard Stripe Connect
"separate charges & transfers (delayed)" pattern handles this, but **confirm with a
payments/tax attorney** for your states (money-transmission edge cases).
