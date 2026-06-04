import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import { matchesAnyRule } from "../lib/rules";
import type { PullRule, ShowEvent } from "../types";

export function Shows() {
  const { data, createShow } = useStore();
  const [active, setActive] = useState<string | null>(data.shows[0]?.id ?? null);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [id, setId] = useState("");

  const make = () => {
    if (!name.trim()) return;
    const sid = (id.trim() || `SHOW-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`).toUpperCase();
    createShow({ id: sid, name: name.trim(), locationId: sid });
    setActive(sid); setName(""); setId(""); setShow(false);
  };

  const current = data.shows.find((s) => s.id === active);

  return (
    <div className="stack">
      <div className="spread">
        <h1>Show prep</h1>
        <button onClick={() => setShow((s) => !s)}>{show ? "Cancel" : "＋ New show"}</button>
      </div>
      <p className="muted">Define pull criteria, generate a location-grouped pull list, then scan cards into the show.</p>

      {show && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row">
            <div className="field grow"><label>Show name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dallas Card Show 2026" /></div>
            <div className="field grow"><label>Show / location ID (optional)</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder="SHOW-DALLAS-2026" /></div>
          </div>
          <button onClick={make}>Create show</button>
        </div>
      )}

      {data.shows.length > 0 && (
        <div className="row">
          {data.shows.map((s) => (
            <button key={s.id} className={s.id === active ? "" : "ghost"} onClick={() => setActive(s.id)}>{s.name}</button>
          ))}
        </div>
      )}

      {current ? <ShowDetail show={current} /> : <div className="card"><p className="muted">No show selected. Create one to begin.</p></div>}
    </div>
  );
}

function ShowDetail({ show }: { show: ShowEvent }) {
  const { data, addPullRule, removePullRule, assignToShow } = useStore();
  const [r, setR] = useState<Omit<PullRule, "id">>({ label: "", game: "", tier: undefined, minPrice: undefined, maxPrice: undefined, grade: "", rarity: "" });

  // Candidate pull list = available cards (not already at this show) matching any rule.
  const pull = useMemo(() => {
    if (show.rules.length === 0) return [];
    return data.inventory
      .filter((i) => i.status === "available" || (i.status === "at_show" && i.locationId !== show.locationId))
      .map((i) => ({ i, c: data.cards.find((c) => c.id === i.cardMasterId) }))
      .filter(({ i, c }) => matchesAnyRule(i, c, show.rules));
  }, [data, show]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof pull>();
    for (const row of pull) {
      const arr = m.get(row.i.locationId) ?? [];
      arr.push(row);
      m.set(row.i.locationId, arr);
    }
    return [...m.entries()];
  }, [pull]);

  const addRule = () => {
    const label = r.label.trim() || describeRule(r);
    addPullRule(show.id, {
      label,
      game: r.game || undefined,
      tier: r.tier || undefined,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      grade: r.grade || undefined,
      rarity: r.rarity || undefined,
    });
    setR({ label: "", game: "", tier: undefined, minPrice: undefined, maxPrice: undefined, grade: "", rarity: "" });
  };

  const atShow = data.inventory.filter((i) => i.locationId === show.locationId && i.status === "at_show");

  return (
    <>
      <div className="card">
        <h2>Pull rules → {show.locationId}</h2>
        {show.rules.length === 0 ? <p className="muted">No rules yet.</p> : (
          <table>
            <tbody>
              {show.rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.label}</td>
                  <td className="muted small">{describeRule(rule)}</td>
                  <td style={{ textAlign: "right" }}><button className="ghost sm" onClick={() => removePullRule(show.id, rule.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="field"><label>Game</label>
            <select value={r.game} onChange={(e) => setR({ ...r, game: e.target.value })}>
              <option value="">Any</option>
              {[...new Set(data.cards.map((c) => c.game))].map((g) => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Tier</label>
            <select value={r.tier ?? ""} onChange={(e) => setR({ ...r, tier: (e.target.value || undefined) as any })}>
              <option value="">Any</option>
              {data.settings.tiers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select></div>
          <div className="field" style={{ width: 100 }}><label>Min $</label><input inputMode="decimal" value={r.minPrice ?? ""} onChange={(e) => setR({ ...r, minPrice: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
          <div className="field" style={{ width: 100 }}><label>Max $</label><input inputMode="decimal" value={r.maxPrice ?? ""} onChange={(e) => setR({ ...r, maxPrice: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
          <div className="field" style={{ width: 110 }}><label>Grade has</label><input value={r.grade} onChange={(e) => setR({ ...r, grade: e.target.value })} placeholder="PSA 10" /></div>
          <div className="field"><label>&nbsp;</label><button onClick={addRule}>＋ Add rule</button></div>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>Pull list — {pull.length} card(s), {grouped.length} location(s)</h2>
          <button disabled={pull.length === 0} onClick={() => assignToShow(show.id, pull.map((p) => p.i.id))}>
            ✓ Scan all into {show.locationId}
          </button>
        </div>
        {grouped.length === 0 ? <p className="muted">Add a rule to generate the pull list.</p> : grouped.map(([loc, rows]) => (
          <div key={loc} style={{ marginTop: 10 }}>
            <strong>{loc}</strong> <span className="muted small">({rows.length})</span>
            <table>
              <tbody>
                {rows.map(({ i, c }) => (
                  <tr key={i.id}>
                    <td>{i.id}</td><td>{c?.name ?? "—"}</td>
                    <td><span className={`badge tier-${i.tier}`}>{i.tier}</span></td>
                    <td>{money(i.askingPrice)}</td>
                    <td style={{ textAlign: "right" }}><button className="ghost sm" onClick={() => assignToShow(show.id, [i.id])}>Scan in</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>At this show — {atShow.length} card(s)</h2>
        {atShow.length === 0 ? <p className="muted">Nothing staged yet.</p> : (
          <table>
            <thead><tr><th>FC-ID</th><th>Card</th><th>Ask</th></tr></thead>
            <tbody>
              {atShow.map((i) => {
                const c = data.cards.find((x) => x.id === i.cardMasterId);
                return <tr key={i.id}><td>{i.id}</td><td>{c?.name ?? "—"}</td><td>{money(i.askingPrice)}</td></tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function describeRule(r: Omit<PullRule, "id">): string {
  const parts: string[] = [];
  if (r.game) parts.push(r.game);
  if (r.tier) parts.push(`${r.tier} tier`);
  if (r.minPrice != null) parts.push(`≥ ${money(r.minPrice)}`);
  if (r.maxPrice != null) parts.push(`≤ ${money(r.maxPrice)}`);
  if (r.grade) parts.push(`grade ${r.grade}`);
  if (r.rarity) parts.push(r.rarity);
  return parts.join(" · ") || "All inventory";
}
