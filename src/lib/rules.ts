import type { CardMaster, InventoryItem, PullRule } from "../types";

/** Does an inventory item satisfy a single pull rule? Set fields are ANDed. */
export function matchesRule(item: InventoryItem, card: CardMaster | undefined, rule: PullRule): boolean {
  if (rule.game && card?.game !== rule.game) return false;
  if (rule.tier && item.tier !== rule.tier) return false;
  if (rule.minPrice != null && item.askingPrice < rule.minPrice) return false;
  if (rule.maxPrice != null && item.askingPrice > rule.maxPrice) return false;
  if (rule.rarity && card?.rarity !== rule.rarity) return false;
  if (rule.grade) {
    const g = (item.grade ?? "").toLowerCase();
    if (!g.includes(rule.grade.toLowerCase())) return false;
  }
  return true;
}

export function matchesAnyRule(item: InventoryItem, card: CardMaster | undefined, rules: PullRule[]): boolean {
  return rules.some((r) => matchesRule(item, card, r));
}
