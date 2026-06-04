import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { money, daysBetween } from "../lib/format";

export function Dashboard() {
  const { data } = useStore();
  const inv = data.inventory;
  const available = inv.filter((i) => i.status === "available");
  const sold = inv.filter((i) => i.status === "sold" || i.status === "sold_pending_fulfillment");
  const pending = inv.filter((i) => i.status === "sold_pending_fulfillment");

  const onHandValue = available.reduce((s, i) => s + i.askingPrice, 0);
  const costAtRisk = available.reduce((s, i) => s + i.costBasis, 0);
  const revenue = data.transactions.reduce((s, t) => s + t.soldTotal, 0);
  const grossProfit = data.transactions.reduce(
    (s, t) => s + t.soldTotal - t.lines.reduce((c, l) => c + l.costBasis, 0),
    0
  );

  // Pull-up: cards that have appreciated past their tier's pull-up threshold
  const pullUps = available.filter((i) => {
    const card = data.cards.find((c) => c.id === i.cardMasterId);
    if (!card) return false;
    if (i.tier === "bulk") return card.marketPrice >= data.settings.pullUpBulkOver;
    if (i.tier === "standard") return card.marketPrice >= data.settings.pullUpStandardOver;
    return false;
  });

  return (
    <div className="stack">
      <div>
        <h1>Dashboard</h1>
        <p className="muted">Inventory velocity, not collection value, is the metric that matters.</p>
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="n">{available.length}</div><div className="l">Cards available</div></div>
        <div className="stat"><div className="n">{money(onHandValue)}</div><div className="l">On-hand asking value</div></div>
        <div className="stat"><div className="n">{money(costAtRisk)}</div><div className="l">Cost basis at risk</div></div>
        <div className="stat"><div className="n">{sold.length}</div><div className="l">Cards sold</div></div>
        <div className="stat"><div className="n">{money(revenue)}</div><div className="l">Lifetime revenue</div></div>
        <div className="stat"><div className="n">{money(grossProfit)}</div><div className="l">Gross profit</div></div>
      </div>

      {pullUps.length > 0 && (
        <div className="banner warn">
          📈 {pullUps.length} card(s) have appreciated past your pull-up threshold — consider moving them up a tier:{" "}
          {pullUps.map((p) => p.id).join(", ")}
        </div>
      )}

      {pending.length > 0 && (
        <div className="banner warn">
          📦 {pending.length} card(s) sold and pending warehouse fulfillment.
        </div>
      )}

      <div className="card">
        <h2>Quick actions</h2>
        <div className="row">
          <Link to="/intake"><button>＋ New intake batch</button></Link>
          <Link to="/pos"><button className="ghost">🛒 Start a sale</button></Link>
          <Link to="/inventory"><button className="ghost">Browse inventory</button></Link>
        </div>
      </div>

      <div className="card">
        <h2>Recent sales</h2>
        {data.transactions.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <table>
            <thead><tr><th>Txn</th><th>Cards</th><th>Sold</th><th>Method</th><th>When</th></tr></thead>
            <tbody>
              {data.transactions.slice(0, 6).map((t) => (
                <tr key={t.id}>
                  <td><Link to="/transactions">{t.id}</Link></td>
                  <td>{t.lines.length}</td>
                  <td>{money(t.soldTotal)}</td>
                  <td className="muted">{t.paymentMethod}</td>
                  <td className="muted small">{daysBetween(t.createdAt) === 0 ? "today" : `${daysBetween(t.createdAt)}d ago`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
