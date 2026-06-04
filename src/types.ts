// ---------------------------------------------------------------------------
// Fulcrum POS — domain types
// Two main data layers: CardMaster (the card) and InventoryItem (one physical
// copy a dealer owns). Pricing lives on the CardMaster; inventory references it.
// ---------------------------------------------------------------------------

export type ValueTierKey = "bulk" | "standard" | "premium" | "elite";

export interface ValueTier {
  key: ValueTierKey;
  label: string;
  /** inclusive lower bound in dollars */
  min: number;
  /** inclusive upper bound in dollars; null = no upper bound */
  max: number | null;
  /** does this tier require an actual front/back photo before listing? */
  requirePhoto: boolean;
  /** does committing a card in this tier require owner approval? */
  requireApproval: boolean;
}

export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG" | "GRADED";

export interface CardMaster {
  id: string; // e.g. OP13-118
  game: string; // One Piece, Pokemon, ...
  set: string; // OP13
  number: string; // OP13-118
  name: string; // Monkey.D.Luffy
  rarity: string; // SEC, SR, ...
  variation: string; // Alt Art / SP / Manga / Promo / Winner
  language: string; // English, Japanese
  /** current market price (owner can override) */
  marketPrice: number;
  /** true if marketPrice was set manually rather than by the pricing job */
  marketOverride: boolean;
  imageUrl?: string;
}

export type InventoryStatus =
  | "available"
  | "reserved"
  | "at_show"
  | "sold"
  | "sold_pending_fulfillment";

export type LocationKind = "box" | "binder" | "case" | "warehouse" | "show";

export interface StorageLocation {
  id: string; // BOX-0147, OP-BINDER-A, CASE-A, SHOW-DALLAS-2026
  kind: LocationKind;
  label: string;
  game?: string;
  tier?: ValueTierKey;
  /** for bulk boxes / binders: approximate count of loose cards not individually tracked */
  approxCount?: number;
  /** for binders: open slot count (merchandising vacancies) */
  openSlots?: number;
  notes?: string;
}

export interface InventoryItem {
  id: string; // FC-000123
  cardMasterId: string;
  costBasis: number;
  askingPrice: number;
  minPrice?: number;
  status: InventoryStatus;
  tier: ValueTierKey;
  locationId: string;
  condition: Condition;
  grade?: string; // PSA 10
  frontPhotoUrl?: string;
  backPhotoUrl?: string;
  createdAt: string;
  /** order within the committing batch — drives label print order */
  batchOrder?: number;
  notes?: string;
}

export type PaymentMethod = "cash" | "card" | "venmo" | "paypal" | "zelle" | "other";

export interface TransactionLine {
  inventoryId: string;
  cardMasterId: string;
  description: string;
  askingPrice: number;
  /** sale price allocated to this card after any cart-level discount */
  allocatedPrice: number;
  costBasis: number;
}

export interface Transaction {
  id: string; // TX-000045
  createdAt: string;
  lines: TransactionLine[];
  askingTotal: number;
  soldTotal: number;
  discount: number;
  taxRate: number; // percent, e.g. 8.25
  tax: number;
  paymentMethod: PaymentMethod;
  locationId?: string; // show/store/event
  operator: string;
  customer?: string;
  note?: string;
}

export type BatchStatus = "open" | "committed" | "discarded";

export interface StagedCard {
  tempId: string;
  cardMasterId?: string;
  rawName: string; // free-typed identity before matching
  costBasis: number;
  askingPrice: number;
  condition: Condition;
  exception?: string; // why this row needs attention
}

export interface IntakeBatch {
  id: string; // BATCH-0007
  createdAt: string;
  game: string;
  tier: ValueTierKey;
  locationId: string;
  operator: string;
  status: BatchStatus;
  staged: StagedCard[];
  committedInventoryIds?: string[];
}

export interface Settings {
  businessName: string;
  publicBaseUrl: string; // e.g. https://fulcrumcards.com
  defaultOperator: string;
  defaultTaxRate: number;
  tiers: ValueTier[];
  /** pull-up thresholds: flag cards that have appreciated past these */
  pullUpBulkOver: number;
  pullUpStandardOver: number;
}

export interface AppData {
  settings: Settings;
  cards: CardMaster[];
  inventory: InventoryItem[];
  locations: StorageLocation[];
  batches: IntakeBatch[];
  transactions: Transaction[];
  counters: {
    inventory: number;
    transaction: number;
    batch: number;
    box: number;
  };
}
