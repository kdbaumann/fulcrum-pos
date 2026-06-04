# Fulcrum POS — Dealer Card Inventory / POS Platform

A browser-based inventory, QR, show-sales, and fulfillment platform for collectible
card dealers. Works on phone, tablet, or laptop — no native app required. This is the
**Phase 1 MVP**.

## What's in Phase 1

- **Two-layer data model** — `CardMaster` (the card + market price) and `InventoryItem`
  (one physical copy you own, with cost basis / asking / min price / status / location).
- **Batch intake → commit → print** — stage cards fast, fix exceptions, then commit.
  Inventory IDs (`FC-000123`) are assigned in scan order and QR labels print in the same
  order so you peel them straight onto the stack. Uncommitted batches can be discarded.
- **Value tiers** — Bulk / Standard / Premium / Elite, with editable thresholds that
  drive photo and approval requirements (Settings page).
- **Locations** — box / binder / case / warehouse / show. Binders track open slots
  (merchandising vacancies) and auto-increment when a card sells.
- **QR codes** — every item has a QR pointing at `/<base-url>/i/FC-000123`. The QR stores
  only the URL, never card data.
- **Customer vs dealer views** — the public `/i/:id` page shows price + condition + buy/offer;
  the dealer view shows cost basis, market value, P/L, location, and edit/sell/move/reprice.
- **POS / cart** — scan or search to build a cart, apply a negotiated/cash total (discount is
  computed and allocated per card), pick a payment method (cash, card, Venmo, PayPal, Zelle,
  other), and take cash with change due. Each sale records both transaction- and card-level data.
- **Sales + accounting CSV export** — transaction history with per-card allocation and a
  one-click accounting CSV (gross, discount, tax, cost basis, gross profit, inventory IDs…).
- **Dashboard** — on-hand value, cost at risk, revenue, gross profit, plus a pull-up alert
  for cards that have appreciated past their tier threshold.

> **Storage:** Phase 1 keeps all data in the browser (localStorage), so it runs with zero
> backend and works offline at a show. The data layer (`src/lib/store.tsx`) is isolated so a
> real API/database can drop in for Phase 2 without touching the UI.

Phase 2 (pricing engine, show-prep pull lists, warehouse fulfillment, customer checkout,
owner alerts, offers) and Phase 3 (analytics, integrations, auto-repricing) build on this.

## Run it locally

You need Node.js 18+ (you don't currently have it installed). Install it once:

```bash
brew install node          # macOS, you already have Homebrew
```

Then:

```bash
cd ~/fulcrum-pos
npm install
npm run dev                # open the printed http://localhost:5173 URL
```

Build a production bundle with `npm run build` (output in `dist/`).

## Tech

Vite + React + TypeScript + React Router. QR codes via `qrcode`. No CSS framework — a single
hand-written `src/styles.css`.

## Project layout

```
src/
  types.ts            domain model (CardMaster, InventoryItem, Transaction, …)
  lib/
    store.tsx         localStorage-backed data store + all actions (swap for an API later)
    seed.ts           sample data
    pricing.ts        tier resolution + profit/margin
    csv.ts, format.ts helpers
  components/         Layout, QRCode, shared UI
  pages/              Dashboard, Intake, Inventory, ItemDetail, POS,
                      Transactions, Locations, Settings, PublicItem (public QR page)
```

See [DEPLOY.md](DEPLOY.md) for GitHub + Netlify setup.
