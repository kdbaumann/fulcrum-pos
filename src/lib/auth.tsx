import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export type AccountType = "vendor" | "collector";

export interface CurrentOrg {
  id: string;
  name: string;
  slug: string;
  type: AccountType;
  role: "owner" | "operator";
}

interface AuthState {
  configured: boolean;
  loading: boolean;
  localDemo: boolean;
  session: Session | null;
  user: User | null;
  org: CurrentOrg | null;
  signUp: (i: { email: string; password: string; displayName: string; orgName: string; type: AccountType }) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  createOrg: (name: string, type: AccountType) => Promise<{ error?: string }>;
  enterLocalDemo: () => void;
  exitLocalDemo: () => void;
}

const DEMO_KEY = "fulcrum-local-demo";
const Ctx = createContext<AuthState | null>(null);

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "org";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured;
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<CurrentOrg | null>(null);
  const [localDemo, setLocalDemo] = useState(() => localStorage.getItem(DEMO_KEY) === "1");

  const fetchOrg = useCallback(async (uid: string): Promise<CurrentOrg | null> => {
    if (!supabase) return null;
    const { data } = await supabase
      .from("memberships")
      .select("role, organizations(id,name,slug,type)")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    const o = (data as any)?.organizations;
    return o ? { id: o.id, name: o.name, slug: o.slug, type: o.type, role: (data as any).role } : null;
  }, []);

  // Load the user's org; if none exists but a pending signup is stashed (email-confirm
  // flow), finish the bootstrap now that we finally have a session.
  const syncUser = useCallback(async (user: User | null) => {
    if (!supabase || !user) { setOrg(null); return; }
    let o = await fetchOrg(user.id);
    if (!o) {
      const pending = localStorage.getItem("fulcrum-pending-org");
      if (pending) {
        try {
          const { orgName, type, displayName } = JSON.parse(pending);
          await supabase.from("profiles").upsert({ user_id: user.id, full_name: displayName, email: user.email });
          await supabase.rpc("create_org", { p_name: orgName, p_slug: slugify(orgName), p_type: type });
          localStorage.removeItem("fulcrum-pending-org");
          o = await fetchOrg(user.id);
        } catch { /* leave to Onboarding screen */ }
      }
    }
    setOrg(o);
  }, [fetchOrg]);

  const loadOrg = useCallback(async (uid: string) => { setOrg(await fetchOrg(uid)); }, [fetchOrg]);

  useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await syncUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await syncUser(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, syncUser]);

  const ensureProfile = useCallback(async (user: User, displayName: string) => {
    if (!supabase) return;
    await supabase.from("profiles").upsert({ user_id: user.id, full_name: displayName, email: user.email });
  }, []);

  const createOrg = useCallback(async (name: string, type: AccountType) => {
    if (!supabase) return { error: "Backend not configured" };
    const { error } = await supabase.rpc("create_org", { p_name: name, p_slug: slugify(name), p_type: type });
    if (error) return { error: error.message };
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadOrg(data.user.id);
    return {};
  }, [loadOrg]);

  const value: AuthState = {
    configured,
    loading,
    localDemo,
    session,
    user: session?.user ?? null,
    org,
    async signUp({ email, password, displayName, orgName, type }) {
      if (!supabase) return { error: "Backend not configured" };
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (data.session && data.user) {
        // Email confirmation off → session exists → bootstrap profile + org now.
        await ensureProfile(data.user, displayName);
        await createOrg(orgName || displayName, type);
        return {};
      }
      // No session => email confirmation is ON. Stash the pending org details so we can
      // finish bootstrap right after the user confirms and signs in.
      localStorage.setItem("fulcrum-pending-org", JSON.stringify({ orgName: orgName || displayName, type, displayName }));
      return { needsConfirmation: true };
    },
    async signIn(email, password) {
      if (!supabase) return { error: "Backend not configured" };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      setOrg(null);
    },
    createOrg,
    enterLocalDemo() {
      localStorage.setItem(DEMO_KEY, "1");
      setLocalDemo(true);
    },
    exitLocalDemo() {
      localStorage.removeItem(DEMO_KEY);
      setLocalDemo(false);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
