// ---------------------------------------------------------------------------
// Supabase repository — maps the DB (snake_case, uuid PKs) to the app's AppData
// shape (camelCase, human codes as ids). Increment 1: settings, cards,
// locations, inventory (+ intake commit). Other domains added in Increment 2.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";
import { DEFAULT_TIERS } from "./seed";
import { pad } from "./format";
import type {
  AppData, CardMaster, InventoryItem, StorageLocation, Settings, Condition,
  InventoryStatus, ValueTierKey, LocationKind,
} from "../types";

// code -> uuid lookups for the current org session (relations need uuids)
const uuidOf = {
  card: new Map<string, string>(),
  location: new Map<string, string>(),
  inventory: new Map<string, string>(),
};
let currentOrgId: string | null = null;

function db() {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

// ---------- row -> app mappers ----------
const toCard = (r: any): CardMaster => ({
  id: r.code, game: r.game, set: r.set_code, number: r.number, name: r.name,
  rarity: r.rarity, variation: r.variation, language: r.language,
  marketPrice: Number(r.market_price), marketOverride: r.market_override,
  imageUrl: r.image_url ?? undefined,
});

const toLocation = (r: any): StorageLocation => ({
  id: r.code, kind: r.kind as LocationKind, label: r.label, game: r.game ?? undefined,
  tier: (r.tier ?? undefined) as ValueTierKey | undefined,
  approxCount: r.approx_count ?? undefined, openSlots: r.open_slots ?? undefined,
  notes: r.notes ?? undefined,
});

const toItem = (r: any, cardCodeByUuid: Map<string, string>, locCodeByUuid: Map<string, string>): InventoryItem => ({
  id: r.code,
  cardMasterId: r.card_id ? cardCodeByUuid.get(r.card_id) ?? "" : "",
  costBasis: Number(r.cost_basis), askingPrice: Number(r.asking_price),
  minPrice: r.min_price == null ? undefined : Number(r.min_price),
  status: r.status as InventoryStatus, tier: r.tier as ValueTierKey,
  locationId: r.location_id ? locCodeByUuid.get(r.location_id) ?? "" : "",
  condition: r.condition as Condition, grade: r.grade ?? undefined,
  frontPhotoUrl: r.front_photo_url ?? undefined, backPhotoUrl: r.back_photo_url ?? undefined,
  createdAt: r.created_at, soldAt: r.sold_at ?? undefined,
  batchOrder: r.batch_order ?? undefined, notes: r.notes ?? undefined,
  fulfillment: r.fulfillment ?? undefined,
});

const toSettings = (r: any): Settings => ({
  businessName: r.business_name, publicBaseUrl: r.public_base_url,
  defaultOperator: r.default_operator, defaultTaxRate: Number(r.default_tax_rate),
  tiers: Array.isArray(r.tiers) && r.tiers.length ? r.tiers : DEFAULT_TIERS.map((t) => ({ ...t })),
  pullUpBulkOver: Number(r.pull_up_bulk_over), pullUpStandardOver: Number(r.pull_up_standard_over),
  offerAutoDeclineBelowPct: Number(r.offer_auto_decline_below_pct),
  highValueAlertOver: Number(r.high_value_alert_over), lastPricedAt: r.last_priced_at ?? undefined,
});

// ---------- load everything for an org ----------
export async function loadAll(orgId: string): Promise<AppData> {
  currentOrgId = orgId;
  uuidOf.card.clear(); uuidOf.location.clear(); uuidOf.inventory.clear();
  const s = db();

  const [settingsRes, cardsRes, locsRes, invRes] = await Promise.all([
    s.from("settings").select("*").eq("org_id", orgId).maybeSingle(),
    s.from("cards").select("*").eq("org_id", orgId),
    s.from("locations").select("*").eq("org_id", orgId),
    s.from("inventory_items").select("*").eq("org_id", orgId),
  ]);

  const cardCodeByUuid = new Map<string, string>();
  for (const r of cardsRes.data ?? []) { uuidOf.card.set(r.code, r.id); cardCodeByUuid.set(r.id, r.code); }
  const locCodeByUuid = new Map<string, string>();
  for (const r of locsRes.data ?? []) { uuidOf.location.set(r.code, r.id); locCodeByUuid.set(r.id, r.code); }
  for (const r of invRes.data ?? []) uuidOf.inventory.set(r.code, r.id);

  // Seed default value tiers into a brand-new org's settings so the UI has them.
  let settings: Settings;
  if (settingsRes.data) {
    settings = toSettings(settingsRes.data);
    if (!Array.isArray(settingsRes.data.tiers) || settingsRes.data.tiers.length === 0) {
      await s.from("settings").update({ tiers: settings.tiers }).eq("org_id", orgId);
    }
  } else {
    settings = toSettings({
      business_name: "My Card Shop", public_base_url: "", default_operator: "Owner",
      default_tax_rate: 0, tiers: [], pull_up_bulk_over: 10, pull_up_standard_over: 50,
      offer_auto_decline_below_pct: 60, high_value_alert_over: 250,
    });
  }

  return {
    role: "owner",
    settings,
    cards: (cardsRes.data ?? []).map(toCard),
    locations: (locsRes.data ?? []).map(toLocation),
    inventory: (invRes.data ?? []).map((r) => toItem(r, cardCodeByUuid, locCodeByUuid)),
    // Increment 2 domains — empty until their writes are migrated:
    batches: [], transactions: [], offers: [], shows: [], notifications: [], searchMisses: [],
    counters: { inventory: 0, transaction: 0, batch: 0, box: 0, offer: 0 },
  };
}

// ---------- settings ----------
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const row: Record<string, any> = {};
  if (patch.businessName !== undefined) row.business_name = patch.businessName;
  if (patch.publicBaseUrl !== undefined) row.public_base_url = patch.publicBaseUrl;
  if (patch.defaultOperator !== undefined) row.default_operator = patch.defaultOperator;
  if (patch.defaultTaxRate !== undefined) row.default_tax_rate = patch.defaultTaxRate;
  if (patch.tiers !== undefined) row.tiers = patch.tiers;
  if (patch.pullUpBulkOver !== undefined) row.pull_up_bulk_over = patch.pullUpBulkOver;
  if (patch.pullUpStandardOver !== undefined) row.pull_up_standard_over = patch.pullUpStandardOver;
  if (patch.offerAutoDeclineBelowPct !== undefined) row.offer_auto_decline_below_pct = patch.offerAutoDeclineBelowPct;
  if (patch.highValueAlertOver !== undefined) row.high_value_alert_over = patch.highValueAlertOver;
  if (patch.lastPricedAt !== undefined) row.last_priced_at = patch.lastPricedAt;
  if (Object.keys(row).length) await db().from("settings").update(row).eq("org_id", currentOrgId);
}

// ---------- cards ----------
export async function upsertCardRow(card: CardMaster): Promise<void> {
  const row = {
    org_id: currentOrgId, code: card.id, game: card.game, set_code: card.set, number: card.number,
    name: card.name, rarity: card.rarity, variation: card.variation, language: card.language,
    market_price: card.marketPrice, market_override: card.marketOverride, image_url: card.imageUrl ?? null,
  };
  const existing = uuidOf.card.get(card.id);
  if (existing) {
    await db().from("cards").update(row).eq("id", existing);
  } else {
    const { data } = await db().from("cards").insert(row).select("id").single();
    if (data) uuidOf.card.set(card.id, data.id);
  }
}

export async function setCardPriceRow(cardCode: string, price: number, override: boolean): Promise<void> {
  const id = uuidOf.card.get(cardCode);
  if (id) await db().from("cards").update({ market_price: price, market_override: override }).eq("id", id);
}

// ---------- locations ----------
export async function insertLocationRow(loc: StorageLocation): Promise<void> {
  const row = {
    org_id: currentOrgId, code: loc.id, kind: loc.kind, label: loc.label, game: loc.game ?? null,
    tier: loc.tier ?? null, approx_count: loc.approxCount ?? null, open_slots: loc.openSlots ?? null,
    notes: loc.notes ?? null,
  };
  const { data } = await db().from("locations").insert(row).select("id").single();
  if (data) uuidOf.location.set(loc.id, data.id);
}

export async function updateLocationRow(code: string, patch: Partial<StorageLocation>): Promise<void> {
  const id = uuidOf.location.get(code);
  if (!id) return;
  const row: Record<string, any> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.game !== undefined) row.game = patch.game;
  if (patch.tier !== undefined) row.tier = patch.tier;
  if (patch.approxCount !== undefined) row.approx_count = patch.approxCount;
  if (patch.openSlots !== undefined) row.open_slots = patch.openSlots;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (Object.keys(row).length) await db().from("locations").update(row).eq("id", id);
}

// ---------- inventory ----------
function itemPatchToRow(patch: Partial<InventoryItem>): Record<string, any> {
  const row: Record<string, any> = {};
  if (patch.costBasis !== undefined) row.cost_basis = patch.costBasis;
  if (patch.askingPrice !== undefined) row.asking_price = patch.askingPrice;
  if (patch.minPrice !== undefined) row.min_price = patch.minPrice ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.tier !== undefined) row.tier = patch.tier;
  if (patch.locationId !== undefined) row.location_id = uuidOf.location.get(patch.locationId) ?? null;
  if (patch.condition !== undefined) row.condition = patch.condition;
  if (patch.grade !== undefined) row.grade = patch.grade ?? null;
  if (patch.soldAt !== undefined) row.sold_at = patch.soldAt ?? null;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.fulfillment !== undefined) row.fulfillment = patch.fulfillment ?? null;
  return row;
}

export async function updateItemRow(code: string, patch: Partial<InventoryItem>): Promise<void> {
  const id = uuidOf.inventory.get(code);
  if (!id) return;
  const row = itemPatchToRow(patch);
  if (Object.keys(row).length) await db().from("inventory_items").update(row).eq("id", id);
}

/** Next sequential code for a kind (FC-, TX-, BATCH-, OFFER-) via the atomic RPC. */
export async function nextCode(kind: string, prefix: string, width = 6): Promise<string> {
  const { data, error } = await db().rpc("next_counter", { p_org: currentOrgId, p_kind: kind });
  if (error) throw error;
  return `${prefix}${pad(Number(data), width)}`;
}

/** Insert one committed inventory item; returns the app object (code already assigned). */
export async function insertInventoryRow(item: InventoryItem): Promise<void> {
  const row = {
    org_id: currentOrgId, code: item.id,
    card_id: item.cardMasterId ? uuidOf.card.get(item.cardMasterId) ?? null : null,
    cost_basis: item.costBasis, asking_price: item.askingPrice, min_price: item.minPrice ?? null,
    status: item.status, tier: item.tier,
    location_id: item.locationId ? uuidOf.location.get(item.locationId) ?? null : null,
    condition: item.condition, grade: item.grade ?? null, batch_order: item.batchOrder ?? null,
  };
  const { data } = await db().from("inventory_items").insert(row).select("id").single();
  if (data) uuidOf.inventory.set(item.id, data.id);
}
