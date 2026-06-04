import { useState } from "react";
import { useStore } from "../lib/store";
import { money, shortDate } from "../lib/format";

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL"];

export function Fulfillment() {
  const { data, fulfillPull, fulfillShip } = useStore();
  const tasks = data.inventory.filter((i) => i.fulfillment && i.fulfillment.stage !== "shipped");
  const shipped = data.inventory.filter((i) => i.fulfillment?.stage === "shipped");

  return (
    <div className="stack">
      <h1>Warehouse fulfillment</h1>
      <p className="muted">Cards sold off-site that must ship from the warehouse. Pull → label → ship.</p>

      <div className="card">
        <h2>Open pull tasks ({tasks.length})</h2>
        {tasks.length === 0 ? <p className="muted">Nothing to fulfill. 🎉</p> : (
          <table>
            <thead><tr><th>FC-ID</th><th>Card</th><th>Location</th><th>Txn</th><th>Stage</th><th>Action</th></tr></thead>
            <tbody>
              {tasks.map((i) => {
                const c = data.cards.find((x) => x.id === i.cardMasterId);
                return (
                  <tr key={i.id}>
                    <td>{i.id}</td>
                    <td>{c?.name ?? "—"}<div className="muted small">{money(i.askingPrice)}</div></td>
                    <td className="muted small">{i.locationId}</td>
                    <td className="muted small">{i.fulfillment?.transactionId}</td>
                    <td><span className={`badge tier-${i.fulfillment?.stage === "pulled" ? "premium" : "standard"}`}>{i.fulfillment?.stage}</span></td>
                    <td>
                      {i.fulfillment?.stage === "pending"
                        ? <button className="sm" onClick={() => fulfillPull(i.id)}>Mark pulled</button>
                        : <ShipForm onShip={(carrier, tracking) => fulfillShip(i.id, carrier, tracking)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {shipped.length > 0 && (
        <div className="card">
          <h2>Shipped ({shipped.length})</h2>
          <table>
            <thead><tr><th>FC-ID</th><th>Carrier</th><th>Tracking</th><th>Shipped</th></tr></thead>
            <tbody>
              {shipped.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td><td>{i.fulfillment?.carrier}</td>
                  <td className="muted">{i.fulfillment?.tracking}</td>
                  <td className="muted small">{i.fulfillment?.shippedAt ? shortDate(i.fulfillment.shippedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShipForm({ onShip }: { onShip: (carrier: string, tracking: string) => void }) {
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [tracking, setTracking] = useState("");
  return (
    <div className="row" style={{ gap: 4 }}>
      <select value={carrier} onChange={(e) => setCarrier(e.target.value)} style={{ width: 90 }}>
        {CARRIERS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input placeholder="Tracking #" value={tracking} onChange={(e) => setTracking(e.target.value)} style={{ width: 130 }} />
      <button className="sm" disabled={!tracking.trim()} onClick={() => onShip(carrier, tracking.trim())}>Ship</button>
    </div>
  );
}
