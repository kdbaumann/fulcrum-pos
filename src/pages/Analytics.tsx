import { useMemo } from "react";
import { useStore } from "../lib/store";
import { money, daysBetween } from "../lib/format";
import type { CardMaster } from "../types";

interface Agg { count: number; revenue: number; cost: number; }

export function Analytics() {
  const { data } = useStore();

  const sold = useMemo(
    () =>
      data.transactions.flatMap((t) =>
        t.lines.map((l) => ({
          line: l,
          tx: t,
          card: data.cards.find((c) => c.id === l.cardMasterId),
        }))
      ),
    [data]
  );

  const groupBy = (key: (x: { card?: CardMaster; tx: any; line: any }) => string): [string, Agg][] => {
    const m = new Map<string, Agg>();
    for (const s of sold) {
      const k = key(s) || "—";
      const a = m.get(k) ?? { count: 0, revenue: 0, cost: 0 };
      a.count += 1;
      a.revenue += s.line.allocatedPrice;
      a.cost += s.line.costBasis;
      m.set(k, a);
    }
    return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  };

  const totalRev = sold.reduce((s, x) => s + x.line.allocatedPrice, 0);
  const totalCost = sold.reduce((s, x) => s + x.line.costBasis, 0);
  const avgMargin = totalRev > 0 ? (totalRev - totalCost) / totalRev : 0;
  const avgDiscount =
    data.transactions.length > 0
      ? data.transactions.reduce((s, t) => s + (t.askingTotal > 0 ? t.discount / t.askingTotal : 0), 0) /
        data.transactions.length
      : 0;

  // Days held: createdAt -> soldAt for sold items
  const held = data.inventory.filter((i) => i.soldAt).map((i) => daysBetween(i.createdAt, new Date(i.soldAt!).getTime()));
  const avgDaysHeld = held.length ? Math.round(held.reduce((a, b) => a + b, 0) / held.length) : 0;

  // Inventory velocity: sold in last 30d / avg inventory (approx using current available + sold)
  const sold30 = data.inventory.filter((i) => i.soldAt && daysBetween(i.soldAt) <= 30).length;
  const available = data.inventory.filter((i) => i.status === "available").length;
  const velocity = available + sold30 > 0 ? sold30 / (available + sold30) : 0;

  // Slow movers: available > 60 days
  const slow = data.inventory
    .filter((i) => i.status === "available" && daysBetween(i.createdAt) > 60)
    .sort((a, b) => daysBetween(b.createdAt) - daysBetween(a.createdAt));

  const Section = ({ title, rows }: { title: string; rows: [string, Agg][] }) => (
    <div className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">No data.</p> : (
        <table>
          <thead><tr><th>{title.replace("Sales by ", "")}</th><th>Sold</th><th>Revenue</th><th>Margin</th></tr></thead>
          <tbody>
            {rows.map(([k, a]) => (
              <tr key={k}>
                <td>{k}</td><td>{a.count}</td><td>{money(a.revenue)}</td>
                <td>{a.revenue > 0 ? `${Math.round(((a.revenue - a.cost) / a.revenue) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="stack">
      <h1>Analytics</h1>
      <p className="muted">Inventory velocity is the dealer metric that matters most.</p>

      <div className="stat-grid">
        <div className="stat"><div className="n">{money(totalRev)}</div><div className="l">Revenue (allocated)</div></div>
        <div className="stat"><div className="n">{money(totalRev - totalCost)}</div><div className="l">Gross profit</div></div>
        <div className="stat"><div className="n">{Math.round(avgMargin * 100)}%</div><div className="l">Avg margin</div></div>
        <div className="stat"><div className="n">{Math.round(avgDiscount * 100)}%</div><div className="l">Avg discount</div></div>
        <div className="stat"><div className="n">{avgDaysHeld}d</div><div className="l">Avg days held</div></div>
        <div className="stat"><div className="n">{Math.round(velocity * 100)}%</div><div className="l">30-day velocity</div></div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by game" rows={groupBy((s) => s.card?.game ?? "—")} /></div>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by set" rows={groupBy((s) => s.card?.set ?? "—")} /></div>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by rarity" rows={groupBy((s) => s.card?.rarity ?? "—")} /></div>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by variation" rows={groupBy((s) => s.card?.variation ?? "—")} /></div>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by event" rows={groupBy((s) => s.tx.locationId ?? "(no event)")} /></div>
        <div className="grow" style={{ minWidth: 300 }}><Section title="Sales by operator" rows={groupBy((s) => s.tx.operator)} /></div>
      </div>

      <div className="card">
        <h2>Slow-moving inventory ({slow.length}) — held &gt; 60 days</h2>
        {slow.length === 0 ? <p className="muted">Nothing stale. 🎉</p> : (
          <table>
            <thead><tr><th>FC-ID</th><th>Card</th><th>Ask</th><th>Days held</th><th>Location</th></tr></thead>
            <tbody>
              {slow.slice(0, 20).map((i) => {
                const c = data.cards.find((x) => x.id === i.cardMasterId);
                return <tr key={i.id}><td>{i.id}</td><td>{c?.name ?? "—"}</td><td>{money(i.askingPrice)}</td><td>{daysBetween(i.createdAt)}d</td><td className="muted small">{i.locationId}</td></tr>;
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Searched but unavailable ({data.searchMisses.length})</h2>
        <p className="muted small">Demand signals — terms customers/operators searched in POS with no result.</p>
        {data.searchMisses.length === 0 ? <p className="muted">No missed searches logged yet.</p> : (
          <table>
            <thead><tr><th>Search term</th><th>Times</th></tr></thead>
            <tbody>
              {[...data.searchMisses].sort((a, b) => b.count - a.count).slice(0, 20).map((m) => (
                <tr key={m.term}><td>{m.term}</td><td>{m.count}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
