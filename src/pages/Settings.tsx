import { useStore } from "../lib/store";
import { money } from "../lib/format";
import type { ValueTier } from "../types";

export function Settings() {
  const { data, updateSettings, resetAll } = useStore();
  const s = data.settings;

  const updateTier = (key: string, patch: Partial<ValueTier>) => {
    updateSettings({ tiers: s.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)) });
  };

  return (
    <div className="stack">
      <h1>Settings</h1>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Business</h2>
        <div className="field"><label>Business name</label>
          <input value={s.businessName} onChange={(e) => updateSettings({ businessName: e.target.value })} /></div>
        <div className="field"><label>Public base URL (for QR codes)</label>
          <input value={s.publicBaseUrl} onChange={(e) => updateSettings({ publicBaseUrl: e.target.value })} /></div>
        <div className="row">
          <div className="field grow"><label>Default operator</label>
            <input value={s.defaultOperator} onChange={(e) => updateSettings({ defaultOperator: e.target.value })} /></div>
          <div className="field" style={{ width: 120 }}><label>Default tax %</label>
            <input inputMode="decimal" value={s.defaultTaxRate} onChange={(e) => updateSettings({ defaultTaxRate: Number(e.target.value) || 0 })} /></div>
        </div>
      </div>

      <div className="card">
        <h2>Value tiers</h2>
        <p className="muted small">Thresholds drive intake workflow, photo and approval requirements.</p>
        <table>
          <thead><tr><th>Tier</th><th>Min $</th><th>Max $</th><th>Photo req.</th><th>Approval req.</th></tr></thead>
          <tbody>
            {s.tiers.map((t) => (
              <tr key={t.key}>
                <td><span className={`badge tier-${t.key}`}>{t.label}</span></td>
                <td><input style={{ width: 90 }} inputMode="decimal" value={t.min} onChange={(e) => updateTier(t.key, { min: Number(e.target.value) || 0 })} /></td>
                <td><input style={{ width: 90 }} inputMode="decimal" value={t.max ?? ""} placeholder="∞" onChange={(e) => updateTier(t.key, { max: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td><input type="checkbox" style={{ width: "auto" }} checked={t.requirePhoto} onChange={(e) => updateTier(t.key, { requirePhoto: e.target.checked })} /></td>
                <td><input type="checkbox" style={{ width: "auto" }} checked={t.requireApproval} onChange={(e) => updateTier(t.key, { requireApproval: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Pull-up thresholds</h2>
        <p className="muted small">Flag cards on the dashboard once their market value crosses these.</p>
        <div className="row">
          <div className="field grow"><label>Flag bulk cards over</label>
            <input inputMode="decimal" value={s.pullUpBulkOver} onChange={(e) => updateSettings({ pullUpBulkOver: Number(e.target.value) || 0 })} /></div>
          <div className="field grow"><label>Flag standard cards over</label>
            <input inputMode="decimal" value={s.pullUpStandardOver} onChange={(e) => updateSettings({ pullUpStandardOver: Number(e.target.value) || 0 })} /></div>
        </div>
        <p className="muted small">Current: bulk → {money(s.pullUpBulkOver)}, standard → {money(s.pullUpStandardOver)}</p>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Data</h2>
        <p className="muted small">All data is stored locally in this browser (Phase 1). Resetting restores sample data.</p>
        <button className="danger" onClick={() => { if (confirm("Reset ALL data to the sample set? This cannot be undone.")) resetAll(); }}>Reset to sample data</button>
      </div>
    </div>
  );
}
