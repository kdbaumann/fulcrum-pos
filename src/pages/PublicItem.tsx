import { useParams, Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { money } from "../lib/format";

// Customer-facing landing page reached by scanning a card's QR code.
// Shows ONLY public info — never cost basis, market value, or min price.
export function PublicItem() {
  const { id } = useParams();
  const { data, getItem, getCard } = useStore();
  const item = id ? getItem(id) : undefined;
  const card = item ? getCard(item.cardMasterId) : undefined;

  if (!item) {
    return (
      <div className="public">
        <h1>Card not found</h1>
        <p className="muted">This QR code doesn’t match any item in inventory.</p>
      </div>
    );
  }

  const sold = item.status === "sold" || item.status === "sold_pending_fulfillment";
  const available = item.status === "available";

  return (
    <div className="public">
      <div className="card hero">
        <p className="muted small">{data.settings.businessName}</p>
        <h1>{card?.name ?? "Collectible card"}</h1>
        {card && (
          <p className="muted">
            {card.game} · {card.set} {card.number}<br />
            {card.rarity} · {card.variation} · {card.language}
          </p>
        )}
        <p style={{ margin: "8px 0" }}>
          <span className="badge tier-standard">{item.grade ?? item.condition}</span>
        </p>

        <div className="price-big">{money(item.askingPrice)}</div>

        {available ? (
          <div className="stack" style={{ marginTop: 16 }}>
            <button style={{ width: "100%" }} onClick={() => alert("Checkout is wired up in Phase 2 (customer purchase page).")}>
              Buy now
            </button>
            <button className="ghost" style={{ width: "100%" }} onClick={() => alert("Offers go to the owner for Accept / Counter / Decline (Phase 2).")}>
              Make an offer
            </button>
          </div>
        ) : sold ? (
          <p className="banner warn" style={{ marginTop: 16 }}>This card has sold.</p>
        ) : (
          <p className="banner warn" style={{ marginTop: 16 }}>This card is currently {item.status.replace(/_/g, " ")}.</p>
        )}
      </div>
      <p className="muted small" style={{ textAlign: "center", marginTop: 12 }}>
        <Link to={`/inventory/${item.id}`}>Dealer view →</Link>
      </p>
    </div>
  );
}
