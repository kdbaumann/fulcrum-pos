import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import { shortDate } from "../lib/format";
import type { Role } from "../types";

// Tabs gated by role. Operators don't see owner-only admin screens.
const links: { to: string; label: string; end?: boolean; ownerOnly?: boolean }[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/intake", label: "Intake" },
  { to: "/inventory", label: "Inventory" },
  { to: "/pos", label: "Sell / POS" },
  { to: "/shows", label: "Shows" },
  { to: "/fulfillment", label: "Fulfillment" },
  { to: "/offers", label: "Offers", ownerOnly: true },
  { to: "/catalog", label: "Catalog", ownerOnly: true },
  { to: "/locations", label: "Locations" },
  { to: "/transactions", label: "Sales" },
  { to: "/analytics", label: "Analytics", ownerOnly: true },
  { to: "/settings", label: "Settings", ownerOnly: true },
];

export function Layout() {
  const { data, setRole, loading } = useStore();
  const { session, org, signOut, exitLocalDemo, localDemo } = useAuth();
  // In cloud mode the role comes from the signed-in membership; in local mode use the local switcher.
  const isOwner = org ? org.role === "owner" : data.role === "owner";
  const visible = links.filter((l) => isOwner || !l.ownerOnly);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <span>{org ? org.name : data.settings.businessName}</span>
          {org && <span className="badge tier-standard" style={{ marginLeft: 6 }}>{org.type}</span>}
        </div>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <NotificationBell />
          {session && org ? (
            <>
              <span className="muted small">{org.role}</span>
              <button className="ghost sm" onClick={signOut}>Sign out</button>
            </>
          ) : localDemo ? (
            <>
              <span className="badge tier-bulk">local demo</span>
              <button className="ghost sm" onClick={exitLocalDemo}>Exit demo</button>
              <select aria-label="Role" value={data.role} onChange={(e) => setRole(e.target.value as Role)} style={{ width: "auto", padding: "6px 10px" }}>
                <option value="owner">Owner</option>
                <option value="operator">Operator</option>
              </select>
            </>
          ) : (
            <select aria-label="Role" value={data.role} onChange={(e) => setRole(e.target.value as Role)} style={{ width: "auto", padding: "6px 10px" }}>
              <option value="owner">Owner</option>
              <option value="operator">Operator</option>
            </select>
          )}
        </div>
      </header>
      <nav className="tabs">
        {visible.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        {loading ? <p className="muted">Loading your data…</p> : <Outlet />}
      </main>
    </div>
  );
}

function NotificationBell() {
  const { data, markNotificationsRead, clearNotifications } = useStore();
  const [open, setOpen] = useState(false);
  const unread = data.notifications.filter((n) => !n.read).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markNotificationsRead();
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="ghost sm" onClick={toggle} aria-label="Notifications">
        🔔 {unread > 0 && <span className="badge tier-elite" style={{ marginLeft: 4 }}>{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="spread" style={{ marginBottom: 6 }}>
            <strong>Notifications</strong>
            {data.notifications.length > 0 && <button className="ghost sm" onClick={clearNotifications}>Clear</button>}
          </div>
          {data.notifications.length === 0 ? (
            <p className="muted small">No notifications yet.</p>
          ) : (
            data.notifications.slice(0, 30).map((n) => (
              <div key={n.id} className="notif-item">
                <div className="small">{n.message}</div>
                <div className="muted" style={{ fontSize: 11 }}>{n.kind} · {shortDate(n.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
