import { Fragment, useState } from "react";
import { useStore } from "../lib/store";
import { money, shortDate } from "../lib/format";
import { toCSV, downloadCSV } from "../lib/csv";

export function Transactions() {
  const { data } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const exportAccounting = () => {
    const rows = data.transactions.map((t) => {
      const cost = t.lines.reduce((s, l) => s + l.costBasis, 0);
      return {
        transaction_id: t.id,
        date: shortDate(t.createdAt),
        customer: t.customer ?? "",
        payment_method: t.paymentMethod,
        gross_sale: t.soldTotal,
        discount: t.discount,
        sales_tax: t.tax,
        net_sale: t.soldTotal,
        cost_basis: cost,
        gross_profit: t.soldTotal - cost,
        cards_sold: t.lines.length,
        inventory_ids: t.lines.map((l) => l.inventoryId).join(" "),
        location: t.locationId ?? "",
        operator: t.operator,
      };
    });
    downloadCSV("fulcrum-accounting-export.csv", toCSV(rows));
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Sales <span className="muted small">({data.transactions.length})</span></h1>
        <button onClick={exportAccounting} disabled={data.transactions.length === 0}>⤓ Export accounting CSV</button>
      </div>

      {data.transactions.length === 0 ? (
        <div className="card"><p className="muted">No sales recorded yet. Make one on the Sell / POS page.</p></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Txn</th><th>Date</th><th>Cards</th><th>Asking</th><th>Sold</th><th>Disc.</th><th>Profit</th><th>Method</th><th>Where</th></tr></thead>
            <tbody>
              {data.transactions.map((t) => {
                const cost = t.lines.reduce((s, l) => s + l.costBasis, 0);
                const isOpen = open === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr className="clickable" onClick={() => setOpen(isOpen ? null : t.id)}>
                      <td>{t.id}</td>
                      <td className="muted">{shortDate(t.createdAt)}</td>
                      <td>{t.lines.length}</td>
                      <td>{money(t.askingTotal)}</td>
                      <td>{money(t.soldTotal)}</td>
                      <td className="muted">{t.discount > 0 ? `−${money(t.discount)}` : "—"}</td>
                      <td style={{ color: t.soldTotal - cost >= 0 ? "var(--good)" : "var(--bad)" }}>{money(t.soldTotal - cost)}</td>
                      <td className="muted">{t.paymentMethod}</td>
                      <td className="muted small">{t.locationId ?? "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: "var(--panel-2)" }}>
                          <table>
                            <thead><tr><th>Inv ID</th><th>Card</th><th>Asking</th><th>Allocated</th><th>Cost</th></tr></thead>
                            <tbody>
                              {t.lines.map((l) => (
                                <tr key={l.inventoryId}>
                                  <td>{l.inventoryId}</td>
                                  <td>{l.description}</td>
                                  <td>{money(l.askingPrice)}</td>
                                  <td>{money(l.allocatedPrice)}</td>
                                  <td className="muted">{money(l.costBasis)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {t.customer && <p className="muted small">Customer: {t.customer}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
