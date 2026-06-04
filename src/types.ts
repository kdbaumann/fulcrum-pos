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

export type FulfillmentStage = "pending" | "pulled" | "shipped";

export interface Fulfillment {
  stage: FulfillmentStage;
  transactionId?: string;
  carrier?: string;
  tracking?: string;
  pulledAt?: string;
  shippedAt?: string;
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
  soldAt?: string;
  /** order within the committing batch — drives label print order */
  batchOrder?: number;
  notes?: string;
  /** remote fulfillment tracking when sold off-site */
  fulfillment?: Fulfillment;
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

export type Role = "owner" | "operator" | "customer";

export type OfferStatus = "pending" | "accepted" | "countered" | "declined" | "expired";

export interface Offer {
  id: string; // OFFER-000007
  inventoryId: string;
  cardMasterId: string;
  amount: number;
  counterAmount?: number;
  customerName: string;
  contact?: string;
  status: OfferStatus;
  checkoutToken?: string;
  createdAt: string;
  respondedAt?: string;
}

export type NotificationKind =
  | "sale"
  | "high_value_sale"
  | "offer"
  | "reserved"
  | "fulfillment"
  | "pull_list"
  | "pricing"
  | "show_transfer"
  | "payment_failed"
  | "inventory_mismatch";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  createdAt: string;
  read: boolean;
}

/** Criteria for pulling inventory to a show. Any set field must match (AND). */
export interface PullRule {
  id: string;
  label: string;
  game?: string;
  tier?: ValueTierKey;
  minPrice?: number;
  maxPrice?: number;
  grade?: string;
  rarity?: string;
}

export interface ShowEvent {
  id: string; // SHOW-DALLAS-2026
  name: string;
  locationId: string; // the show location cards are staged into
  rules: PullRule[];
  createdAt: string;
}

export interface SearchMiss {
  term: string;
  count: number;
  lastAt: string;
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
  /** owner alert / auto-handling thresholds for offers */
  offerAutoDeclineBelowPct: number; // decline offers below this % of asking
  highValueAlertOver: number; // alert when a card over this $ sells
  lastPricedAt?: string;
}

export interface AppData {
  role: Role;
  settings: Settings;
  cards: CardMaster[];
  inventory: InventoryItem[];
  locations: StorageLocation[];
  batches: IntakeBatch[];
  transactions: Transaction[];
  offers: Offer[];
  shows: ShowEvent[];
  notifications: AppNotification[];
  searchMisses: SearchMiss[];
  counters: {
    inventory: number;
    transaction: number;
    batch: number;
    box: number;
    offer: number;
  };
}
