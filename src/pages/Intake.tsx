import { useState } from "react";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import { tierForPrice, tierMeta } from "../lib/pricing";
import { QRCode } from "../components/QRCode";
import type { Condition, IntakeBatch } from "../types";

export function Intake() {
  const { data, createBatch, addStaged, updateStaged, removeStaged, discardBatch, commitBatch } = useStore();
  const openBatch = data.batches.find((b) => b.status === "open");
  const lastCommitted = data.batches.find((b) => b.status === "committed");

  if (!openBatch) {
    return <StartBatch onStart={createBatch} settings={data.settings} lastCommitted={lastCommitted} />;
  }

  return (
    <ActiveBatch
      batch={openBatch}
      onAdd={addStaged}
      onUpdate={updateStaged}
      onRemove={removeStaged}
      onDiscard={discardBatch}
      onCommit={commitBatch}
    />
  );
}

function StartBatch({
  onStart,
  settings,
  lastCommitted,
}: {
  onStart: ReturnType<typeof useStore>["createBatch"];
  settings: ReturnType<typeof useStore>["data"]["settings"];
  lastCommitted?: IntakeBatch;
}) {
  const { data } = useStore();
  const [game, setGame] = useState("One Piece");
  const [tier, setTier] = useState("bulk");
  const [locationId, setLocationId] = useState(data.locations[0]?.id ?? "");
  const [operator, setOperator] = useState(settings.defaultOperator);

  return (
    <div className="stack">
      <h1>Batch intake</h1>
      <p className="muted">
        Stage cards fast — nothing is committed and no labels print until you approve the batch.
      </p>

      {lastCommitted && lastCommitted.committedInventoryIds && (
        <div className="banner good">
          Last batch {lastCommitted.id} committed {lastCommitted.committedInventoryIds.length} cards.
        </div>
      )}

      <div className="card" style={{ maxWidth: 520 }}>
        <h2>Start a new batch</h2>
        <div className="field"><label>Game / category</label>
          <input value={game} onChange={(e) => setGame(e.target.value)} /></div>
        <div className="field"><label>Value tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {settings.tiers.map((t) => <option key={t.key} value={t.key}>{t.label} ({money(t.min)}{t.max == null ? "+" : `–${money(t.max)}`})</option>)}
          </select></div>
        <div className="field"><label>Intake location</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.id} — {l.label}</option>)}
          </select></div>
        <div className="field"><label>Operator</label>
          <input value={operator} onChange={(e) => setOperator(e.target.value)} /></div>
        <button onClick={() => onStart({ game, tier: tier as any, locationId, operator })} disabled={!locationId}>
          Start batch
        </button>
      </div>
    </div>
  );
}

function ActiveBatch({
  batch,
  onAdd,
  onUpdate,
  onRemove,
  onDiscard,
  onCommit,
}: {
  batch: IntakeBatch;
  onAdd: ReturnType<typeof useStore>["addStaged"];
  onUpdate: ReturnType<typeof useStore>["updateStaged"];
  onRemove: ReturnType<typeof useStore>["removeStaged"];
  onDiscard: ReturnType<typeof useStore>["discardBatch"];
  onCommit: ReturnType<typeof useStore>["commitBatch"];
}) {
  const { data } = useStore();
  const [rawName, setRawName] = useState("");
  const [cardMasterId, setCardMasterId] = useState("");
  const [cost, setCost] = useState("");
  const [ask, setAsk] = useState("");
  const [cond, setCond] = useState<Condition>("NM");
  const [printIds, setPrintIds] = useState<string[] | null>(null);

  const meta = tierMeta(batch.tier, data.settings.tiers);
  const exceptions = batch.staged.filter((s) => s.exception).length;

  const add = () => {
    if (!rawName.trim() && !cardMasterId) return;
    const matched = data.cards.find((c) => c.id === cardMasterId);
    onAdd(batch.id, {
      rawName: matched ? matched.name : rawName.trim(),
      cardMasterId: cardMasterId || undefined,
      costBasis: Number(cost) || 0,
      askingPrice: Number(ask) || 0,
      condition: cond,
    });
    setRawName(""); setCardMasterId(""); setCost(""); setAsk("");
  };

  const commit = async () => {
    if (meta?.requireApproval && !confirm(`${meta.label} tier requires owner approval. Commit ${batch.staged.length} cards?`)) return;
    const ids = await onCommit(batch.id);
    setPrintIds(ids);
  };

  // After commit: show printable label sheet in scan order
  if (printIds) {
    return <LabelSheet ids={printIds} baseUrl={data.settings.publicBaseUrl} onDone={() => setPrintIds(null)} batch={batch} />;
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{batch.id}</h1>
          <p className="muted">{batch.game} · {meta?.label} · → {batch.locationId} · {batch.operator}</p>
        </div>
        <button className="danger sm" onClick={() => { if (confirm("Discard this batch? Staged cards are not saved.")) onDiscard(batch.id); }}>
          Discard batch
        </button>
      </div>

      <div className="card">
        <h2>Scan / add card</h2>
        <div className="toolbar">
          <div className="field" style={{ minWidth: 200 }}>
            <label>Match to Card Master (optional)</label>
            <select value={cardMasterId} onChange={(e) => {
              setCardMasterId(e.target.value);
              const c = data.cards.find((x) => x.id === e.target.value);
              if (c) { setRawName(c.name); if (!ask) setAsk(String(c.marketPrice)); }
            }}>
              <option value="">— type name below —</option>
              {data.cards.map((c) => <option key={c.id} value={c.id}>{c.set} {c.number} · {c.name}</option>)}
            </select>
          </div>
          <div className="field grow" style={{ minWidth: 160 }}>
            <label>Card name</label>
            <input value={rawName} onChange={(e) => setRawName(e.target.value)} placeholder="e.g. Luffy SEC" onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Cost</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0" />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Ask</label>
            <input value={ask} onChange={(e) => setAsk(e.target.value)} inputMode="decimal" placeholder="0" onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div className="field" style={{ width: 100 }}>
            <label>Cond.</label>
            <select value={cond} onChange={(e) => setCond(e.target.value as Condition)}>
              {["NM", "LP", "MP", "HP", "DMG", "GRADED"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>&nbsp;</label><button onClick={add}>＋ Stage</button></div>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>Staged — {batch.staged.length} cards {exceptions > 0 && <span className="badge tier-elite">{exceptions} exceptions</span>}</h2>
        </div>
        {batch.staged.length === 0 ? (
          <p className="muted">No cards staged yet. Add cards above; they commit in scan order.</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Card</th><th>Cost</th><th>Ask</th><th>Tier @ ask</th><th>Cond.</th><th></th></tr></thead>
            <tbody>
              {batch.staged.map((s, i) => (
                <tr key={s.tempId}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    {s.rawName || <span className="muted">(unnamed)</span>}
                    {s.exception && <div className="small" style={{ color: "var(--warn)" }}>⚠ {s.exception}</div>}
                  </td>
                  <td>{money(s.costBasis)}</td>
                  <td>{money(s.askingPrice)}</td>
                  <td><span className={`badge tier-${tierForPrice(s.askingPrice, data.settings.tiers)}`}>{tierForPrice(s.askingPrice, data.settings.tiers)}</span></td>
                  <td>{s.condition}</td>
                  <td><button className="ghost sm" onClick={() => onRemove(batch.id, s.tempId)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="spread">
          <div>
            <strong>Ready to commit?</strong>
            <div className="muted small">Commit assigns FC-IDs in scan order and prints labels in the same order.</div>
          </div>
          <button onClick={commit} disabled={batch.staged.length === 0}>✓ Commit batch & print labels</button>
        </div>
      </div>
    </div>
  );
}

function LabelSheet({
  ids,
  baseUrl,
  onDone,
  batch,
}: {
  ids: string[];
  baseUrl: string;
  onDone: () => void;
  batch: IntakeBatch;
}) {
  return (
    <div className="stack">
      <div className="banner good no-print">
        ✓ Committed {ids.length} cards as {ids[0]} … {ids[ids.length - 1]}. Print, then peel labels in order onto the stack.
      </div>
      <div className="spread no-print">
        <h1>QR labels — scan order</h1>
        <div className="row">
          <button onClick={() => window.print()}>🖨 Print labels</button>
          <button className="ghost" onClick={onDone}>Done</button>
        </div>
      </div>
      <div className="labels">
        {ids.map((id, i) => (
          <div className="label" key={id}>
            <div className="lid">#{i + 1} · {id}</div>
            <QRCode value={`${baseUrl}/i/${id}`} size={96} />
            <div className="lmeta">{batch.game} · {batch.locationId}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
