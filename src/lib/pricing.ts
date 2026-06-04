import type { ValueTier, ValueTierKey } from "../types";

/** Resolve which value tier a dollar amount falls into. */
export function tierForPrice(price: number, tiers: ValueTier[]): ValueTierKey {
  for (const t of tiers) {
    const underMax = t.max == null || price <= t.max;
    if (price >= t.min && underMax) return t.key;
  }
  // fall back to the highest tier if above every defined max
  return tiers[tiers.length - 1]?.key ?? "standard";
}

export function tierMeta(key: ValueTierKey, tiers: ValueTier[]): ValueTier | undefined {
  return tiers.find((t) => t.key === key);
}

export const profit = (askingOrSale: number, costBasis: number) => askingOrSale - costBasis;

export const margin = (askingOrSale: number, costBasis: number) =>
  askingOrSale <= 0 ? 0 : (askingOrSale - costBasis) / askingOrSale;
