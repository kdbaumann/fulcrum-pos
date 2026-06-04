import { useStore } from "../lib/store";
import { money, shortDate } from "../lib/format";
import type { OfferStatus } from "../types";

const statusColor: Record<OfferStatus, string> = {
  pending: "var(--warn)", accepted: "var(--good)", countered: "var(--accent)",
  declined: "var(--muted)", expired: "var(--muted)",
};

export function Offers() {
  const { data, respondOffer } = useStore();
  const pending = data.offers.filter((o) => o.status === "pending");
  const rest = data.offers.filter((o) => o.status !== "pending");

  const row = (offerId: string) => {
    const o = data.offers.find((x) => x.id === offerId)!;
    const item = data.inventory.find((i) => i.id === o.inventoryId);
    const card = data.cards.find((c) => c.id === o.cardMasterId);
    const pct = item && item.askingPrice > 0 ? Math.round((o.amount / item.askingPrice) * 100) : 0;
    return (
      <tr key={o.id}>
        <td>{o.id}</td>
        <td>{card?.name ?? o.inventoryId}<div className="muted small">{o.inventoryId} · ask {item ? money(item.askingPrice) : "—"}</div></td>
        <td>{o.customerName}{o.contact && <div className="muted small">{o.contact}</div>}</td>
        <td>{money(o.amount)} <span className="muted small">({pct}%)</span></td>
        <td><span style={{ color: statusColor[o.status], fontWeight: 700 }}>{o.status}</span>{o.counterAmount ? <div className="muted small">counter {money(o.counterAmount)}</div> : null}</td>
        <td>
          {o.status === "pending" ? (
            <div className="row" style={{ gap: 4 }}>
              <button className="sm" onClick={() => respondOffer(o.id, "accept")}>Accept</button>
              <button className="ghost sm" onClick={() => { const v = prompt("Counter amount", String(item?.askingPrice ?? o.amount)); if (v != null && Number.isFinite(Number(v))) respondOffer(o.id, "counter", Number(v)); }}>Counter</button>
              <button className="ghost sm" onClick={() => respondOffer(o.id, "decline")}>Decline</button>
            </div>
          ) : o.status === "accepted" && o.checkoutToken ? (
            <span className="muted small">checkout: {data.settings.publicBaseUrl}/checkout/{o.checkoutToken}</span>
          ) : (
            <span className="muted small">{o.respondedAt ? shortDate(o.respondedAt) : ""}</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="stack">
      <h1>Offers <span className="muted small">({pending.length} pending)</span></h1>
      <p className="muted">Offers below {data.settings.offerAutoDeclineBelowPct}% of asking are auto-declined (Settings). Accepting reserves the card and issues a checkout link.</p>

      <div className="card">
        <h2>Pending</h2>
        {pending.length === 0 ? <p className="muted">No pending offers.</p> : (
          <table>
            <thead><tr><th>Offer</th><th>Card</th><th>Customer</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{pending.map((o) => row(o.id))}</tbody>
          </table>
        )}
      </div>

      {rest.length > 0 && (
        <div className="card">
          <h2>History</h2>
          <table>
            <thead><tr><th>Offer</th><th>Card</th><th>Customer</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>{rest.map((o) => row(o.id))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
