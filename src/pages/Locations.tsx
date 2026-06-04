import { useState } from "react";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import type { LocationKind } from "../types";

const KINDS: LocationKind[] = ["box", "binder", "case", "warehouse", "show"];

export function Locations() {
  const { data, addLocation, refillBinder } = useStore();
  const [show, setShow] = useState(false);
  const [id, setId] = useState("");
  const [kind, setKind] = useState<LocationKind>("box");
  const [label, setLabel] = useState("");
  const [game, setGame] = useState("");

  const counts = (locId: string) =>
    data.inventory.filter((i) => i.locationId === locId && i.status !== "sold").length;

  const create = () => {
    if (!id.trim()) return;
    addLocation({
      id: id.trim().toUpperCase(),
      kind,
      label: label.trim() || id.trim(),
      game: game.trim() || undefined,
      openSlots: kind === "binder" ? 0 : undefined,
      approxCount: kind === "box" ? 0 : undefined,
    });
    setId(""); setLabel(""); setGame(""); setShow(false);
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Locations</h1>
        <button onClick={() => setShow((s) => !s)}>{show ? "Cancel" : "＋ New location"}</button>
      </div>
      <p className="muted">
        Bulk = box-level. Binder = merchandising space (track open slots). Case/Vault = precise location for high-end.
      </p>

      {show && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="toolbar">
            <div className="field"><label>ID</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder="BOX-0148 / OP-BINDER-B / CASE-B / SHOW-DALLAS-2026" /></div>
            <div className="field"><label>Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div className="toolbar">
            <div className="field grow"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            <div className="field"><label>Game (optional)</label><input value={game} onChange={(e) => setGame(e.target.value)} /></div>
          </div>
          <button onClick={create}>Create location</button>
        </div>
      )}

      {data.locations.some((l) => l.kind === "binder" && (l.openSlots ?? 0) > 0) && (
        <div className="card">
          <h2>Binder refill — replace red SOLD placeholders</h2>
          <p className="muted small">Scan a replacement card into a binder with open slots. It need not match the old slot — the binder is merchandising space.</p>
          {data.locations.filter((l) => l.kind === "binder" && (l.openSlots ?? 0) > 0).map((b) => (
            <BinderRefill key={b.id} binderId={b.id} openSlots={b.openSlots ?? 0} onRefill={refillBinder} />
          ))}
        </div>
      )}

      {KINDS.map((k) => {
        const locs = data.locations.filter((l) => l.kind === k);
        if (locs.length === 0) return null;
        return (
          <div className="card" key={`group-${k}`}>
            <h2 style={{ textTransform: "capitalize" }}>{k}</h2>
            <table>
              <thead><tr><th>ID</th><th>Label</th><th>Game</th><th>Tracked cards</th><th>Open slots</th></tr></thead>
              <tbody>
                {locs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>{l.label}</td>
                    <td className="muted">{l.game ?? "—"}</td>
                    <td>{counts(l.id)}</td>
                    <td>{l.kind === "binder" ? (l.openSlots ?? 0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function BinderRefill({
  binderId,
  openSlots,
  onRefill,
}: {
  binderId: string;
  openSlots: number;
  onRefill: (binderId: string, inventoryId: string) => void;
}) {
  const { data } = useStore();
  const [sel, setSel] = useState("");
  // Candidates: available cards not already in this binder.
  const candidates = data.inventory.filter((i) => i.status === "available" && i.locationId !== binderId);
  return (
    <div className="toolbar" style={{ alignItems: "center" }}>
      <strong style={{ minWidth: 140 }}>{binderId}</strong>
      <span className="badge tier-elite">{openSlots} open</span>
      <div className="field grow" style={{ minWidth: 220 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Select replacement card…</option>
          {candidates.map((i) => {
            const c = data.cards.find((x) => x.id === i.cardMasterId);
            return <option key={i.id} value={i.id}>{i.id} — {c?.name ?? "card"} ({money(i.askingPrice)}) @ {i.locationId}</option>;
          })}
        </select>
      </div>
      <button className="sm" disabled={!sel} onClick={() => { onRefill(binderId, sel); setSel(""); }}>Refill slot</button>
    </div>
  );
}
