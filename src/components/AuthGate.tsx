import { Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LoginScreen, OnboardingScreen } from "../pages/Login";

// Decides what the dealer/collector app shows based on auth state.
// Local mode (no backend configured, or user chose the demo bypass) renders the
// app directly so nothing breaks during the backend transition.
export function AuthGate() {
  const { configured, localDemo, loading, session, org } = useAuth();

  if (!configured || localDemo) return <Outlet />;
  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="muted">Loading…</div>
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  if (!org) return <OnboardingScreen />;
  return <Outlet />;
}
