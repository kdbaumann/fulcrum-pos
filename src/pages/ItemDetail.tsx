import { useParams, Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { money, daysBetween, shortDate } from "../lib/format";
import { tierForPrice } from "../lib/pricing";
import { QRCode } from "../components/QRCode";
import { TierBadge, StatusText } from "../components/ui";

export function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, getItem, getCard, updateItem } = useStore();
  const item = id ? getItem(id) : undefined;

  if (!item) {
    return <div className="card"><p>Item not found. <Link to="/inventory">Back to inventory</Link></p></div>;
  }
  const card = getCard(item.cardMasterId);
  const publicUrl = `${data.settings.publicBaseUrl}/i/${item.id}`;
  const pl = item.askingPrice - item.costBasis;

  const reprice = () => {
    const v = prompt("New asking price", String(item.askingPrice));
    if (v == null) return;
    const price = Number(v);
    if (!Number.isFinite(price)) return;
    updateItem(item.id, { askingPrice: price, tier: tierForPrice(price, data.settings.tiers) });
  };
  const move = () => {
    const v = prompt("Move to location ID (e.g. CASE-A)", item.locationId);
    if (v == null) return;
    if (!data.locations.some((l) => l.id === v)) {
      alert("Unknown location. Create it on the Locations page first.");
      return;
    }
    updateItem(item.id, { locationId: v });
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>{item.id}</h1>
        <button className="ghost sm" onClick={() => nav(-1)}>← Back</button>
      </div>

      <div className="row">
        <div className="card grow" style={{ minWidth: 280 }}>
          <h2>{card ? card.name : "Unmatched card"}</h2>
          {card && (
            <p className="muted">
              {card.game} · {card.set} {card.number} · {card.rarity} · {card.variation} · {card.language}
            </p>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <TierBadge tier={item.tier} /> <StatusText status={item.status} />
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><th>Cost basis</th><td>{money(item.costBasis)}</td></tr>
              <tr><th>Asking price</th><td>{money(item.askingPrice)}</td></tr>
              <tr><th>Min price</th><td>{item.minPrice != null ? money(item.minPrice) : "—"}</td></tr>
              <tr><th>Market value</th><td>{card ? money(card.marketPrice) : "—"}{card?.marketOverride ? " (override)" : ""}</td></tr>
              <tr><th>Profit / loss</th><td style={{ color: pl >= 0 ? "var(--good)" : "var(--bad)" }}>{money(pl)}</td></tr>
              <tr><th>Condition</th><td>{item.grade ?? item.condition}</td></tr>
              <tr><th>Location</th><td>{item.locationId}</td></tr>
              <tr><th>Created</th><td>{shortDate(item.createdAt)} · {daysBetween(item.createdAt)}d held</td></tr>
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={reprice}>Reprice</button>
            <button className="ghost" onClick={move}>Move</button>
            {item.status === "available" && (
              <button className="ghost" onClick={() => updateItem(item.id, { status: "reserved" })}>Reserve</button>
            )}
            {item.status === "reserved" && (
              <button className="ghost" onClick={() => updateItem(item.id, { status: "available" })}>Un-reserve</button>
            )}
          </div>
        </div>

        <div className="card" style={{ textAlign: "center" }}>
          <h2>QR label</h2>
          <QRCode value={publicUrl} size={150} />
          <p className="muted small" style={{ wordBreak: "break-all", marginTop: 8 }}>{publicUrl}</p>
          <Link to={`/i/${item.id}`}><button className="ghost sm">Preview customer view</button></Link>
        </div>
      </div>
    </div>
  );
}
