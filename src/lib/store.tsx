import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  AppData,
  CardMaster,
  InventoryItem,
  IntakeBatch,
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

const STORAGE_KEY = "fulcrum-pos:v1";

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {
    /* ignore corrupt storage */
  }
  return seedData();
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

      recordSale(input) {
        const tx = buildTransaction(input, data);
        setData((d) => {
          const soldIds = new Set(input.items.map((i) => i.id));
          // increment binder open slots for any binder cards sold
          const binderHits = new Map<string, number>();
          for (const it of input.items) {
            const loc = d.locations.find((l) => l.id === it.locationId);
            if (loc?.kind === "binder") binderHits.set(loc.id, (binderHits.get(loc.id) ?? 0) + 1);
          }
          return {
            ...d,
            inventory: d.inventory.map((i) =>
              soldIds.has(i.id)
                ? {
                    ...i,
                    // sold off-site => needs fulfillment; otherwise plain sold
                    status:
                      input.locationId &&
                      i.locationId !== input.locationId &&
                      d.locations.find((l) => l.id === i.locationId)?.kind === "warehouse"
                        ? "sold_pending_fulfillment"
                        : "sold",
                  }
                : i
            ),
            locations: d.locations.map((l) =>
              binderHits.has(l.id)
                ? { ...l, openSlots: (l.openSlots ?? 0) + (binderHits.get(l.id) ?? 0) }
                : l
            ),
            transactions: [tx, ...d.transactions],
            counters: { ...d.counters, transaction: d.counters.transaction + 1 },
          };
        });
        return tx;
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
