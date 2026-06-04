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

## Open decisions that shape the payments build

1. **Connected-account type** — Express (recommended), Standard, or Custom?
2. **Money flow** — destination charges (simpler) or escrow-style hold-and-release (buyer
   protection, more complex)?
3. **Who can sell** — vendors **and** collectors (recommended), or vendors only at first?
4. **Build order** — keep building the app (login → vendor → collector → listings) **now**
   while you run the off-app checklist in parallel (recommended), or pause app work to focus
   on payments groundwork first?

(These can be finalized when we reach the payments milestone; #1–#3 mainly affect the
`orders`/`payments` schema, which we haven't written yet.)
