import type { InventoryStatus, ValueTierKey } from "../types";

const statusLabel: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  at_show: "At Show",
  sold: "Sold",
  sold_pending_fulfillment: "Sold — Pending Fulfillment",
};

export function TierBadge({ tier }: { tier: ValueTierKey }) {
  return <span className={`badge tier-${tier}`}>{tier}</span>;
}

export function StatusText({ status }: { status: InventoryStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>;
}
