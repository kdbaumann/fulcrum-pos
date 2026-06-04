import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import type { InventoryItem, PaymentMethod } from "../types";

const METHODS: PaymentMethod[] = ["cash", "card", "venmo", "paypal", "zelle", "other"];

export function POS() {
  const { data, recordSale } = useStore();
  const [cart, setCart] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [soldOverride, setSoldOverride] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [locationId, setLocationId] = useState("");
  const [operator, setOperator] = useState(data.settings.defaultOperator);
  const [customer, setCustomer] = useState("");
  const [taxRate, setTaxRate] = useState(String(data.settings.defaultTaxRate));
  const [receipt, setReceipt] = useState<{ id: string; soldTotal: number; change: number } | null>(null);
  const [tendered, setTendered] = useState("");

  const available = data.inventory.filter((i) => i.status === "available" || i.status === "at_show");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return available
      .filter((i) => !cart.includes(i.id))
      .map((i) => ({ i, c: data.cards.find((c) => c.id === i.cardMasterId) }))
      .filter(({ i, c }) =>
        [i.id, c?.name, c?.set, c?.number, c?.game].filter(Boolean).join(" ").toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [q, available, cart, data.cards]);

  const cartItems: InventoryItem[] = cart
    .map((id) => data.inventory.find((i) => i.id === id))
    .filter((x): x is InventoryItem => !!x);

  const askingTotal = cartItems.reduce((s, i) => s + i.askingPrice, 0);
  const soldTotal = soldOverride.trim() === "" ? askingTotal : Math.max(0, Number(soldOverride) || 0);
  const discount = Math.max(0, askingTotal - soldTotal);
  const tax = Math.round(soldTotal * (Number(taxRate) / 100) * 100) / 100;
  const grandTotal = soldTotal + tax;
  const change = method === "cash" && tendered ? Math.max(0, Number(tendered) - grandTotal) : 0;

  const add = (id: string) => { setCart((c) => [...c, id]); setQ(""); };
  const remove = (id: string) => setCart((c) => c.filter((x) => x !== id));
  const clear = () => { setCart([]); setSoldOverride(""); setTendered(""); setCustomer(""); };

  const checkout = () => {
    if (cartItems.length === 0) return;
    const tx = recordSale({
      items: cartItems,
      soldTotal,
      taxRate: Number(taxRate) || 0,
      paymentMethod: method,
      locationId: locationId || undefined,
      operator,
      customer: customer || undefined,
    });
    setReceipt({ id: tx.id, soldTotal: tx.soldTotal, change });
    clear();
  };

  const cardLabel = (i: InventoryItem) => {
    const c = data.cards.find((x) => x.id === i.cardMasterId);
    return c ? `${c.name} · ${c.set} ${c.number}` : i.id;
  };

  return (
    <div className="stack">
      <h1>Sell / POS</h1>

      {receipt && (
        <div className="banner good">
          ✓ {receipt.id} complete — collected {money(receipt.soldTotal)}.
          {receipt.change > 0 && <> Change due: <strong>{money(receipt.change)}</strong>.</>}
          <button className="ghost sm" style={{ marginLeft: 12 }} onClick={() => setReceipt(null)}>Dismiss</button>
        </div>
      )}

      <div className="pos-layout">
        <div className="stack">
          <div className="card">
            <h2>Add cards</h2>
            <input
              autoFocus
              placeholder="Scan or search by name, set, number, FC-ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && results[0]) add(results[0].i.id); }}
            />
            {results.length > 0 && (
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {results.map(({ i }) => (
                    <tr key={i.id} className="clickable" onClick={() => add(i.id)}>
                      <td>{cardLabel(i)}</td>
                      <td className="muted small">{i.id} · {i.locationId}</td>
                      <td style={{ textAlign: "right" }}>{money(i.askingPrice)}</td>
                      <td style={{ textAlign: "right" }}><button className="sm">Add</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card pos-cart">
          <div className="spread">
            <h2>Cart ({cartItems.length})</h2>
            {cartItems.length > 0 && <button className="ghost sm" onClick={clear}>Clear</button>}
          </div>

          {cartItems.length === 0 ? (
            <p className="muted">Scan or search to add cards.</p>
          ) : (
            <>
              <div>
                {cartItems.map((i) => (
                  <div className="cart-line" key={i.id}>
                    <span>{cardLabel(i)}</span>
                    <span>
                      {money(i.askingPrice)}{" "}
                      <button className="ghost sm" onClick={() => remove(i.id)}>✕</button>
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="total-line"><span className="muted">Asking total</span><span>{money(askingTotal)}</span></div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Negotiated / cash total (blank = asking)</label>
                  <input inputMode="decimal" value={soldOverride} onChange={(e) => setSoldOverride(e.target.value)} placeholder={String(askingTotal)} />
                </div>
                {discount > 0 && <div className="total-line"><span className="muted">Discount</span><span style={{ color: "var(--warn)" }}>−{money(discount)}</span></div>}
                <div className="total-line"><span className="muted">Tax ({taxRate}%)</span><span>{money(tax)}</span></div>
                <div className="total-line big"><span>Total</span><span>{money(grandTotal)}</span></div>
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <label>Payment method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {method === "cash" && (
                <div className="field">
                  <label>Cash tendered</label>
                  <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(grandTotal)} />
                  {Number(tendered) > 0 && <div className="muted small">Change: {money(change)}</div>}
                </div>
              )}

              <div className="row">
                <div className="field grow"><label>Show / location</label>
                  <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">—</option>
                    {data.locations.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
                  </select>
                </div>
                <div className="field" style={{ width: 90 }}><label>Tax %</label>
                  <input inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                </div>
              </div>
              <div className="row">
                <div className="field grow"><label>Operator</label><input value={operator} onChange={(e) => setOperator(e.target.value)} /></div>
                <div className="field grow"><label>Customer (optional)</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
              </div>

              <button style={{ width: "100%" }} onClick={checkout}>Complete sale · {money(grandTotal)}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
