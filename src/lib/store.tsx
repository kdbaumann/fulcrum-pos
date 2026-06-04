import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  AppData,
  AppNotification,
  CardMaster,
  InventoryItem,
  IntakeBatch,
  NotificationKind,
  Offer,
  OfferStatus,
  PullRule,
  Role,
  ShowEvent,
  StagedCard,
  StorageLocation,
  Transaction,
  TransactionLine,
  Settings,
  PaymentMethod,
} from "../types";
import { seedData } from "./seed";
import { nowISO, pad } from "./format";
import { tierForPrice } from "./pricing";
import { uid } from "./ids";

function notif(kind: NotificationKind, message: string): AppNotification {
  return { id: uid("N-"), kind, message, createdAt: nowISO(), read: false };
}

const STORAGE_KEY = "fulcrum-pos:v1";

function load(): AppData {
  const base = seedData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppData>;
      // Shallow migration: keep saved data, backfill any keys added in later versions.
      return {
        ...base,
        ...saved,
        settings: { ...base.settings, ...(saved.settings ?? {}) },
        counters: { ...base.counters, ...(saved.counters ?? {}) },
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return base;
}

interface NewStaged {
  rawName: string;
  costBasis: number;
  askingPrice: number;
  condition: StagedCard["condition"];
  cardMasterId?: string;
}

interface Store {
  data: AppData;
  // settings
  updateSettings: (patch: Partial<Settings>) => void;
  // cards
  getCard: (id: string) => CardMaster | undefined;
  upsertCard: (card: CardMaster) => void;
  // inventory
  getItem: (id: string) => InventoryItem | undefined;
  updateItem: (id: string, patch: Partial<InventoryItem>) => void;
  // locations
  addLocation: (loc: StorageLocation) => void;
  updateLocation: (id: string, patch: Partial<StorageLocation>) => void;
  // batches
  createBatch: (init: Pick<IntakeBatch, "game" | "tier" | "locationId" | "operator">) => string;
  addStaged: (batchId: string, card: NewStaged) => void;
  updateStaged: (batchId: string, tempId: string, patch: Partial<StagedCard>) => void;
  removeStaged: (batchId: string, tempId: string) => void;
  discardBatch: (batchId: string) => void;
  commitBatch: (batchId: string) => string[]; // returns new inventory ids in scan order
  // sales
  recordSale: (input: {
    items: InventoryItem[];
    soldTotal: number;
    taxRate: number;
    paymentMethod: PaymentMethod;
    locationId?: string;
    operator: string;
    customer?: string;
    note?: string;
  }) => Transaction;
  // role
  setRole: (role: Role) => void;
  // offers
  submitOffer: (input: { inventoryId: string; amount: number; customerName: string; contact?: string }) => Offer;
  respondOffer: (offerId: string, action: "accept" | "decline" | "counter", counterAmount?: number) => void;
  // customer purchase (from public QR page)
  buyNow: (inventoryId: string, customerName?: string) => Transaction | null;
  // shows
  createShow: (input: { id: string; name: string; locationId: string }) => void;
  addPullRule: (showId: string, rule: Omit<PullRule, "id">) => void;
  removePullRule: (showId: string, ruleId: string) => void;
  assignToShow: (showId: string, inventoryIds: string[]) => void;
  // fulfillment
  fulfillPull: (inventoryId: string) => void;
  fulfillShip: (inventoryId: string, carrier: string, tracking: string) => void;
  // pricing engine
  runPricingUpdate: () => number; // returns # of cards whose price moved
  overridePrice: (cardMasterId: string, price: number) => void;
  // binder refill (red SOLD placeholder replacement)
  refillBinder: (binderId: string, inventoryId: string) => void;
  // notifications
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  // analytics input
  logSearchMiss: (term: string) => void;
  // misc
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable */
    }
  }, [data]);

  const store = useMemo<Store>(() => {
    const recordSaleImpl: Store["recordSale"] = (input) => {
      const tx = buildTransaction(input, data);
      setData((d) => {
        const soldIds = new Set(input.items.map((i) => i.id));
        const soldAt = nowISO();
        const binderHits = new Map<string, number>();
        let pendingCount = 0;
        for (const it of input.items) {
          const loc = d.locations.find((l) => l.id === it.locationId);
          if (loc?.kind === "binder") binderHits.set(loc.id, (binderHits.get(loc.id) ?? 0) + 1);
        }
        const inventory = d.inventory.map((i) => {
          if (!soldIds.has(i.id)) return i;
          const needsFulfillment =
            !!input.locationId &&
            i.locationId !== input.locationId &&
            d.locations.find((l) => l.id === i.locationId)?.kind === "warehouse";
          if (needsFulfillment) pendingCount += 1;
          return {
            ...i,
            soldAt,
            status: (needsFulfillment ? "sold_pending_fulfillment" : "sold") as InventoryItem["status"],
            fulfillment: needsFulfillment ? { stage: "pending" as const, transactionId: tx.id } : i.fulfillment,
          };
        });
        const notes: AppNotification[] = [notif("sale", `${tx.id}: ${tx.lines.length} card(s) sold for ${tx.soldTotal.toFixed(2)} (${tx.paymentMethod}).`)];
        const highValue = input.items.find((i) => i.askingPrice >= d.settings.highValueAlertOver);
        if (highValue) notes.push(notif("high_value_sale", `High-value sale: ${highValue.id} at ${highValue.askingPrice.toFixed(2)}.`));
        if (pendingCount > 0) notes.push(notif("fulfillment", `${pendingCount} card(s) sold off-site need warehouse fulfillment.`));
        return {
          ...d,
          inventory,
          locations: d.locations.map((l) =>
            binderHits.has(l.id) ? { ...l, openSlots: (l.openSlots ?? 0) + (binderHits.get(l.id) ?? 0) } : l
          ),
          transactions: [tx, ...d.transactions],
          notifications: [...notes, ...d.notifications],
          counters: { ...d.counters, transaction: d.counters.transaction + 1 },
        };
      });
      return tx;
    };

    return {
      data,

      updateSettings(patch) {
        setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },

      getCard(id) {
        return data.cards.find((c) => c.id === id);
      },
      upsertCard(card) {
        setData((d) => {
          const exists = d.cards.some((c) => c.id === card.id);
          return {
            ...d,
            cards: exists ? d.cards.map((c) => (c.id === card.id ? card : c)) : [...d.cards, card],
          };
        });
      },

      getItem(id) {
        return data.inventory.find((i) => i.id === id);
      },
      updateItem(id, patch) {
        setData((d) => ({
          ...d,
          inventory: d.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        }));
      },

      addLocation(loc) {
        setData((d) => ({ ...d, locations: [...d.locations, loc] }));
      },
      updateLocation(id, patch) {
        setData((d) => ({
          ...d,
          locations: d.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
      },

      createBatch(init) {
        const id = `BATCH-${pad(data.counters.batch + 1, 4)}`;
        const batch: IntakeBatch = {
          id,
          createdAt: nowISO(),
          status: "open",
          staged: [],
          ...init,
        };
        setData((d) => ({
          ...d,
          batches: [batch, ...d.batches],
          counters: { ...d.counters, batch: d.counters.batch + 1 },
        }));
        return id;
      },
      addStaged(batchId, card) {
        const tempId = `${batchId}-${Math.round(performance.now())}-${Math.floor(performance.now() % 997)}`;
        const staged: StagedCard = {
          tempId,
          rawName: card.rawName,
          costBasis: card.costBasis,
          askingPrice: card.askingPrice,
          condition: card.condition,
          cardMasterId: card.cardMasterId,
          exception: card.cardMasterId ? undefined : "Not matched to a Card Master",
        };
        setData((d) => ({
          ...d,
          batches: d.batches.map((b) =>
            b.id === batchId ? { ...b, staged: [...b.staged, staged] } : b
          ),
        }));
      },
      updateStaged(batchId, tempId, patch) {
        setData((d) => ({
          ...d,
          batches: d.batches.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  staged: b.staged.map((s) =>
                    s.tempId === tempId
                      ? {
                          ...s,
                          ...patch,
                          exception:
                            (patch.cardMasterId ?? s.cardMasterId) ? undefined : s.exception,
                        }
                      : s
                  ),
                }
              : b
          ),
        }));
      },
      removeStaged(batchId, tempId) {
        setData((d) => ({
          ...d,
          batches: d.batches.map((b) =>
            b.id === batchId ? { ...b, staged: b.staged.filter((s) => s.tempId !== tempId) } : b
          ),
        }));
      },
      discardBatch(batchId) {
        setData((d) => ({
          ...d,
          batches: d.batches.map((b) => (b.id === batchId ? { ...b, status: "discarded" } : b)),
        }));
      },

      commitBatch(batchId) {
        const newIds: string[] = [];
        setData((d) => {
          const batch = d.batches.find((b) => b.id === batchId);
          if (!batch || batch.status !== "open") return d;
          let counter = d.counters.inventory;
          const created: InventoryItem[] = batch.staged.map((s, idx) => {
            counter += 1;
            const id = `FC-${pad(counter)}`;
            newIds.push(id);
            return {
              id,
              cardMasterId: s.cardMasterId ?? "",
              costBasis: s.costBasis,
              askingPrice: s.askingPrice,
              status: "available",
              tier: tierForPrice(s.askingPrice, d.settings.tiers),
              locationId: batch.locationId,
              condition: s.condition,
              createdAt: nowISO(),
              batchOrder: idx + 1,
            };
          });
          return {
            ...d,
            inventory: [...created, ...d.inventory],
            counters: { ...d.counters, inventory: counter },
            batches: d.batches.map((b) =>
              b.id === batchId
                ? { ...b, status: "committed", committedInventoryIds: created.map((c) => c.id) }
                : b
            ),
          };
        });
        return newIds;
      },

      recordSale: recordSaleImpl,

      setRole(role) {
        setData((d) => ({ ...d, role }));
      },

      submitOffer(input) {
        const item = data.inventory.find((i) => i.id === input.inventoryId);
        const id = `OFFER-${pad(data.counters.offer + 1)}`;
        const pct = item && item.askingPrice > 0 ? (input.amount / item.askingPrice) * 100 : 0;
        const autoDecline = pct > 0 && pct < data.settings.offerAutoDeclineBelowPct;
        const offer: Offer = {
          id,
          inventoryId: input.inventoryId,
          cardMasterId: item?.cardMasterId ?? "",
          amount: input.amount,
          customerName: input.customerName,
          contact: input.contact,
          status: autoDecline ? "declined" : "pending",
          createdAt: nowISO(),
          respondedAt: autoDecline ? nowISO() : undefined,
        };
        setData((d) => ({
          ...d,
          offers: [offer, ...d.offers],
          counters: { ...d.counters, offer: d.counters.offer + 1 },
          notifications: [
            notif(
              "offer",
              autoDecline
                ? `Offer ${id} auto-declined (${pct.toFixed(0)}% of asking, below ${d.settings.offerAutoDeclineBelowPct}%).`
                : `New offer ${id}: ${input.customerName} offered ${input.amount.toFixed(2)} on ${input.inventoryId}.`
            ),
            ...d.notifications,
          ],
        }));
        return offer;
      },

      respondOffer(offerId, action, counterAmount) {
        setData((d) => {
          const offer = d.offers.find((o) => o.id === offerId);
          if (!offer) return d;
          const status: OfferStatus =
            action === "accept" ? "accepted" : action === "counter" ? "countered" : "declined";
          const token = action === "accept" ? uid("co_") : offer.checkoutToken;
          return {
            ...d,
            offers: d.offers.map((o) =>
              o.id === offerId
                ? { ...o, status, counterAmount: action === "counter" ? counterAmount : o.counterAmount, checkoutToken: token, respondedAt: nowISO() }
                : o
            ),
            inventory:
              action === "accept"
                ? d.inventory.map((i) => (i.id === offer.inventoryId ? { ...i, status: "reserved" } : i))
                : d.inventory,
            notifications: [
              notif("offer", `Offer ${offerId} ${status}${action === "accept" ? " — checkout link sent." : ""}.`),
              ...d.notifications,
            ],
          };
        });
      },

      buyNow(inventoryId, customerName) {
        const item = data.inventory.find((i) => i.id === inventoryId);
        if (!item || (item.status !== "available" && item.status !== "at_show")) return null;
        return recordSaleImpl({
          items: [item],
          soldTotal: item.askingPrice,
          taxRate: data.settings.defaultTaxRate,
          paymentMethod: "card",
          operator: "Online",
          customer: customerName || "Online customer",
          note: "Customer Buy Now",
        });
      },

      createShow(input) {
        const exists = data.locations.some((l) => l.id === input.locationId);
        setData((d) => ({
          ...d,
          shows: [{ id: input.id, name: input.name, locationId: input.locationId, rules: [], createdAt: nowISO() }, ...d.shows],
          locations: exists
            ? d.locations
            : [...d.locations, { id: input.locationId, kind: "show", label: input.name }],
        }));
      },
      addPullRule(showId, rule) {
        setData((d) => ({
          ...d,
          shows: d.shows.map((s) =>
            s.id === showId ? { ...s, rules: [...s.rules, { ...rule, id: uid("R-") }] } : s
          ),
        }));
      },
      removePullRule(showId, ruleId) {
        setData((d) => ({
          ...d,
          shows: d.shows.map((s) =>
            s.id === showId ? { ...s, rules: s.rules.filter((r) => r.id !== ruleId) } : s
          ),
        }));
      },
      assignToShow(showId, inventoryIds) {
        setData((d) => {
          const show = d.shows.find((s) => s.id === showId);
          if (!show) return d;
          const set = new Set(inventoryIds);
          return {
            ...d,
            inventory: d.inventory.map((i) =>
              set.has(i.id) ? { ...i, locationId: show.locationId, status: "at_show" } : i
            ),
            notifications: [
              notif("show_transfer", `${inventoryIds.length} card(s) staged to ${show.name} (${show.locationId}).`),
              ...d.notifications,
            ],
          };
        });
      },

      fulfillPull(inventoryId) {
        setData((d) => ({
          ...d,
          inventory: d.inventory.map((i) =>
            i.id === inventoryId && i.fulfillment
              ? { ...i, fulfillment: { ...i.fulfillment, stage: "pulled", pulledAt: nowISO() } }
              : i
          ),
        }));
      },
      fulfillShip(inventoryId, carrier, tracking) {
        setData((d) => ({
          ...d,
          inventory: d.inventory.map((i) =>
            i.id === inventoryId && i.fulfillment
              ? { ...i, status: "sold", fulfillment: { ...i.fulfillment, stage: "shipped", carrier, tracking, shippedAt: nowISO() } }
              : i
          ),
          notifications: [notif("fulfillment", `${inventoryId} shipped via ${carrier} (${tracking}).`), ...d.notifications],
        }));
      },

      runPricingUpdate() {
        let moved = 0;
        setData((d) => {
          // Simulated daily pricing job: nudge non-overridden cards by a deterministic-ish %.
          const cards = d.cards.map((c, idx) => {
            if (c.marketOverride) return c;
            const pct = ((idx * 37 + (Date.now() % 11)) % 21) - 10; // -10%..+10%
            const next = Math.max(0.25, Math.round(c.marketPrice * (1 + pct / 100) * 100) / 100);
            if (next !== c.marketPrice) moved += 1;
            return { ...c, marketPrice: next };
          });
          return {
            ...d,
            cards,
            settings: { ...d.settings, lastPricedAt: nowISO() },
            notifications: [notif("pricing", `Pricing job updated ${moved} card(s) from market sources (simulated).`), ...d.notifications],
          };
        });
        return moved;
      },
      overridePrice(cardMasterId, price) {
        setData((d) => ({
          ...d,
          cards: d.cards.map((c) =>
            c.id === cardMasterId ? { ...c, marketPrice: price, marketOverride: true } : c
          ),
        }));
      },

      refillBinder(binderId, inventoryId) {
        setData((d) => {
          const loc = d.locations.find((l) => l.id === binderId);
          if (!loc || loc.kind !== "binder") return d;
          return {
            ...d,
            inventory: d.inventory.map((i) =>
              i.id === inventoryId ? { ...i, locationId: binderId, status: "available" } : i
            ),
            locations: d.locations.map((l) =>
              l.id === binderId ? { ...l, openSlots: Math.max(0, (l.openSlots ?? 0) - 1) } : l
            ),
          };
        });
      },

      markNotificationsRead() {
        setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
      },
      clearNotifications() {
        setData((d) => ({ ...d, notifications: [] }));
      },

      logSearchMiss(term) {
        const t = term.trim().toLowerCase();
        if (t.length < 2) return;
        setData((d) => {
          const existing = d.searchMisses.find((m) => m.term === t);
          return {
            ...d,
            searchMisses: existing
              ? d.searchMisses.map((m) => (m.term === t ? { ...m, count: m.count + 1, lastAt: nowISO() } : m))
              : [{ term: t, count: 1, lastAt: nowISO() }, ...d.searchMisses],
          };
        });
      },

      resetAll() {
        setData(seedData());
      },
    };
  }, [data]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function buildTransaction(
  input: Parameters<Store["recordSale"]>[0],
  data: AppData
): Transaction {
  const id = `TX-${pad(data.counters.transaction + 1)}`;
  const askingTotal = input.items.reduce((s, i) => s + i.askingPrice, 0);
  const soldTotal = input.soldTotal;
  const discount = Math.max(0, askingTotal - soldTotal);
  const factor = askingTotal > 0 ? soldTotal / askingTotal : 0;
  const lines: TransactionLine[] = input.items.map((i) => {
    const card = data.cards.find((c) => c.id === i.cardMasterId);
    return {
      inventoryId: i.id,
      cardMasterId: i.cardMasterId,
      description: card ? `${card.name} · ${card.set} ${card.number}` : i.id,
      askingPrice: i.askingPrice,
      allocatedPrice: Math.round(i.askingPrice * factor * 100) / 100,
      costBasis: i.costBasis,
    };
  });
  const tax = Math.round(soldTotal * (input.taxRate / 100) * 100) / 100;
  return {
    id,
    createdAt: nowISO(),
    lines,
    askingTotal,
    soldTotal,
    discount,
    taxRate: input.taxRate,
    tax,
    paymentMethod: input.paymentMethod,
    locationId: input.locationId,
    operator: input.operator,
    customer: input.customer,
    note: input.note,
  };
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
