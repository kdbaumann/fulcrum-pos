import { useState } from "react";
import { useStore } from "../lib/store";
import { money, shortDate } from "../lib/format";
import type { CardMaster } from "../types";

const BLANK: CardMaster = {
  id: "", game: "", set: "", number: "", name: "", rarity: "", variation: "Regular",
  language: "English", marketPrice: 0, marketOverride: false,
};

export function Catalog() {
  const { data, upsertCard, overridePrice, runPricingUpdate } = useStore();
  const [edit, setEdit] = useState<CardMaster | null>(null);
  const [q, setQ] = useState("");
  const [lastRun, setLastRun] = useState<number | null>(null);

  const cards = data.cards.filter((c) =>
    [c.id, c.name, c.set, c.number, c.game, c.rarity].join(" ").toLowerCase().includes(q.trim().toLowerCase())
  );

  // Pull-up value job: inventory whose market price crossed its tier threshold.
  const pullUps = data.inventory
    .filter((i) => i.status === "available")
    .map((i) => ({ i, c: data.cards.find((c) => c.id === i.cardMasterId) }))
    .filter(({ i, c }) => {
      if (!c) return false;
      if (i.tier === "bulk") return c.marketPrice >= data.settings.pullUpBulkOver;
      if (i.tier === "standard") return c.marketPrice >= data.settings.pullUpStandardOver;
      return false;
    });

  const save = () => {
    if (!edit || !edit.id.trim() || !edit.name.trim()) return;
    upsertCard(edit);
    setEdit(null);
  };

  return (
    <div className="stack">
      <h1>Card catalog & pricing</h1>
      <p className="muted">Market price lives on the Card Master — every matching inventory item references it.</p>

      <div className="card">
        <div className="spread">
          <div>
            <h2 style={{ marginBottom: 4 }}>Pricing engine</h2>
            <div className="muted small">
              Last run: {data.settings.lastPricedAt ? shortDate(data.settings.lastPricedAt) : "never"}.
              {lastRun != null && <> Updated {lastRun} card(s).</>}
              <br />Sources (TCGplayer, eBay sold, PriceCharting, Cardmarket) are simulated in Phase 1.
            </div>
          </div>
          <button onClick={() => setLastRun(runPricingUpdate())}>↻ Run daily pricing update</button>
        </div>
      </div>

      {pullUps.length > 0 && (
        <div className="card">
          <h2>📈 Pull-up value job — {pullUps.length} card(s) appreciated past tier threshold</h2>
          <table>
            <thead><tr><th>FC-ID</th><th>Card</th><th>Tier</th><th>Ask</th><th>Market now</th><th>Location</th></tr></thead>
            <tbody>
              {pullUps.map(({ i, c }) => (
                <tr key={i.id}>
                  <td>{i.id}</td><td>{c?.name}</td><td><span className={`badge tier-${i.tier}`}>{i.tier}</span></td>
                  <td>{money(i.askingPrice)}</td><td style={{ color: "var(--good)" }}>{money(c!.marketPrice)}</td>
                  <td className="muted small">{i.locationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Reprice/move these on each item's detail page to bump them up a tier.</p>
        </div>
      )}

      <div className="card">
        <div className="spread">
          <h2>Cards ({cards.length})</h2>
          <div className="row">
            <input placeholder="Search catalog…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <button onClick={() => setEdit({ ...BLANK })}>＋ New card</button>
          </div>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Game / Set</th><th>Rarity</th><th>Variation</th><th>Market</th><th>Copies</th><th></th></tr></thead>
          <tbody>
            {cards.map((c) => {
              const copies = data.inventory.filter((i) => i.cardMasterId === c.id).length;
              return (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td className="muted small">{c.game} · {c.set} {c.number}</td>
                  <td>{c.rarity}</td>
                  <td>{c.variation}</td>
                  <td>{money(c.marketPrice)} {c.marketOverride && <span className="badge tier-elite">override</span>}</td>
                  <td>{copies}</td>
                  <td className="row" style={{ gap: 4 }}>
                    <button className="ghost sm" onClick={() => setEdit({ ...c })}>Edit</button>
                    <button className="ghost sm" onClick={() => {
                      const v = prompt(`Manual price override for ${c.id}`, String(c.marketPrice));
                      if (v != null && Number.isFinite(Number(v))) overridePrice(c.id, Number(v));
                    }}>Override $</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>{data.cards.some((c) => c.id === edit.id) ? `Edit ${edit.id}` : "New card master"}</h2>
          <div className="row">
            <div className="field grow"><label>Card Master ID</label><input value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} placeholder="OP13-118" /></div>
            <div className="field grow"><label>Name</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field grow"><label>Game</label><input value={edit.game} onChange={(e) => setEdit({ ...edit, game: e.target.value })} /></div>
            <div className="field grow"><label>Set</label><input value={edit.set} onChange={(e) => setEdit({ ...edit, set: e.target.value })} /></div>
            <div className="field grow"><label>Number</label><input value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field grow"><label>Rarity</label><input value={edit.rarity} onChange={(e) => setEdit({ ...edit, rarity: e.target.value })} /></div>
            <div className="field grow"><label>Variation</label><input value={edit.variation} onChange={(e) => setEdit({ ...edit, variation: e.target.value })} /></div>
            <div className="field grow"><label>Language</label><input value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} /></div>
            <div className="field" style={{ width: 120 }}><label>Market $</label><input inputMode="decimal" value={edit.marketPrice} onChange={(e) => setEdit({ ...edit, marketPrice: Number(e.target.value) || 0 })} /></div>
          </div>
          <div className="row">
            <button onClick={save}>Save card</button>
            <button className="ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
