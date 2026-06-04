import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../lib/store";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/intake", label: "Intake" },
  { to: "/inventory", label: "Inventory" },
  { to: "/pos", label: "Sell / POS" },
  { to: "/locations", label: "Locations" },
  { to: "/transactions", label: "Sales" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { data } = useStore();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <span>{data.settings.businessName}</span>
        </div>
        <span className="muted small">Phase 1 MVP</span>
      </header>
      <nav className="tabs">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
