import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import { TierBadge, StatusText } from "../components/ui";

export function Inventory() {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [loc, setLoc] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.inventory
      .map((i) => ({ item: i, card: data.cards.find((c) => c.id === i.cardMasterId) }))
      .filter(({ item, card }) => {
        if (tier && item.tier !== tier) return false;
        if (status && item.status !== status) return false;
        if (loc && item.locationId !== loc) return false;
        if (!term) return true;
        const hay = [
          item.id,
          item.condition,
          item.grade,
          card?.name,
          card?.set,
          card?.number,
          card?.game,
          card?.rarity,
          card?.variation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      });
  }, [data, q, tier, status, loc]);

  return (
    <div className="stack">
      <h1>Inventory <span className="muted small">({rows.length})</span></h1>

      <div className="toolbar">
        <div className="field grow" style={{ minWidth: 220 }}>
          <label>Search</label>
          <input placeholder="Name, set, number, FC-ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label>Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All</option>
            {data.settings.tiers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="at_show">At Show</option>
            <option value="sold">Sold</option>
            <option value="sold_pending_fulfillment">Pending Fulfillment</option>
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">All</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>FC-ID</th><th>Card</th><th>Tier</th><th>Cond.</th>
              <th>Ask</th><th>Market</th><th>P/L</th><th>Location</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, card }) => {
              const pl = item.askingPrice - item.costBasis;
              return (
                <tr key={item.id} className="clickable">
                  <td><Link to={`/inventory/${item.id}`}>{item.id}</Link></td>
                  <td>
                    {card ? `${card.name}` : <span className="muted">— unmatched —</span>}
                    {card && <div className="muted small">{card.set} {card.number} · {card.variation}</div>}
                  </td>
                  <td><TierBadge tier={item.tier} /></td>
                  <td>{item.grade ?? item.condition}</td>
                  <td>{money(item.askingPrice)}</td>
                  <td className="muted">{card ? money(card.marketPrice) : "—"}</td>
                  <td style={{ color: pl >= 0 ? "var(--good)" : "var(--bad)" }}>{money(pl)}</td>
                  <td className="muted small">{item.locationId}</td>
                  <td><StatusText status={item.status} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>No matching cards.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
