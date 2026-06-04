import type { AppData } from "../types";
import { nowISO } from "./format";

export const DEFAULT_TIERS = [
  { key: "bulk", label: "Bulk", min: 0, max: 9.99, requirePhoto: false, requireApproval: false },
  { key: "standard", label: "Standard", min: 10, max: 49.99, requirePhoto: false, requireApproval: false },
  { key: "premium", label: "Premium", min: 50, max: 249.99, requirePhoto: false, requireApproval: false },
  { key: "elite", label: "Elite", min: 250, max: null, requirePhoto: true, requireApproval: true },
] as const;

export function seedData(): AppData {
  const t = nowISO();
  return {
    settings: {
      businessName: "Fulcrum Cards",
      publicBaseUrl: "https://fulcrumcards.com",
      defaultOperator: "Owner",
      defaultTaxRate: 8.25,
      tiers: DEFAULT_TIERS.map((x) => ({ ...x })),
      pullUpBulkOver: 10,
      pullUpStandardOver: 50,
    },
    cards: [
      {
        id: "OP13-118",
        game: "One Piece",
        set: "OP13",
        number: "OP13-118",
        name: "Monkey.D.Luffy",
        rarity: "SEC",
        variation: "Alt Art",
        language: "English",
        marketPrice: 175,
        marketOverride: false,
      },
      {
        id: "OP01-024",
        game: "One Piece",
        set: "OP01",
        number: "OP01-024",
        name: "Trafalgar Law",
        rarity: "SR",
        variation: "Regular",
        language: "English",
        marketPrice: 32,
        marketOverride: false,
      },
      {
        id: "SV-PIKA-238",
        game: "Pokemon",
        set: "151",
        number: "238/165",
        name: "Pikachu",
        rarity: "SIR",
        variation: "Special Illustration",
        language: "English",
        marketPrice: 6.5,
        marketOverride: false,
      },
    ],
    locations: [
      { id: "BOX-0147", kind: "box", label: "Bulk Box 147", game: "One Piece", tier: "bulk", approxCount: 500 },
      { id: "OP-BINDER-A", kind: "binder", label: "One Piece Binder A", game: "One Piece", openSlots: 3 },
      { id: "CASE-A", kind: "case", label: "Showcase A", tier: "premium" },
      { id: "VAULT-1-DRAWER-3", kind: "case", label: "Vault 1 / Drawer 3", tier: "elite" },
      { id: "WAREHOUSE", kind: "warehouse", label: "Main Warehouse" },
    ],
    inventory: [
      {
        id: "FC-000001",
        cardMasterId: "OP13-118",
        costBasis: 120,
        askingPrice: 185,
        minPrice: 160,
        status: "available",
        tier: "premium",
        locationId: "CASE-A",
        condition: "NM",
        createdAt: t,
      },
      {
        id: "FC-000002",
        cardMasterId: "OP01-024",
        costBasis: 14,
        askingPrice: 35,
        status: "available",
        tier: "standard",
        locationId: "OP-BINDER-A",
        condition: "NM",
        createdAt: t,
      },
      {
        id: "FC-000003",
        cardMasterId: "SV-PIKA-238",
        costBasis: 2,
        askingPrice: 8,
        status: "available",
        tier: "bulk",
        locationId: "BOX-0147",
        condition: "NM",
        createdAt: t,
      },
    ],
    batches: [],
    transactions: [],
    counters: { inventory: 3, transaction: 0, batch: 0, box: 147 },
  };
}
