import { useState } from "react";
import { useAuth, type AccountType } from "../lib/auth";

export function LoginScreen() {
  const { signIn, signUp, signInWithPhone, verifyPhoneOtp, resetPasswordEmail, enterLocalDemo } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "phone">("signin");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [type, setType] = useState<AccountType>("vendor");
  const [displayName, setDisplayName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null); setInfo(null);
    if (mode === "signin") {
      const res = await signIn(email, password);
      setBusy(false);
      if (res.error) setError(res.error);
      return;
    }
    const res = await signUp({ email, password, displayName, orgName, type });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.needsConfirmation) {
      setMode("signin");
      setInfo("Account created. Check your email to confirm, then sign in — we'll finish setting up your organization automatically.");
    }
  };

  const sendCode = async () => {
    setBusy(true); setError(null); setInfo(null);
    const res = await signInWithPhone(phone);
    setBusy(false);
    if (res.error) setError(res.error);
    else { setCodeSent(true); setInfo("Code sent by text. Enter it below."); }
  };
  const verifyCode = async () => {
    setBusy(true); setError(null);
    const res = await verifyPhoneOtp(phone, code);
    setBusy(false);
    if (res.error) setError(res.error);
  };
  const forgotPassword = async () => {
    if (!email) { setError("Enter your email first, then tap reset."); return; }
    setBusy(true); setError(null); setInfo(null);
    const res = await resetPasswordEmail(email);
    setBusy(false);
    if (res.error) setError(res.error);
    else setInfo("Password reset link sent to your email.");
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 12 }}>
          <span className="logo">◆</span> <span style={{ fontWeight: 700, fontSize: 20 }}>Fulcrum</span>
        </div>

        <div className="row" style={{ gap: 0, marginBottom: 16 }}>
          <button className={mode === "signin" ? "" : "ghost"} style={{ flex: 1, borderRadius: "8px 0 0 8px" }} onClick={() => setMode("signin")}>Sign in</button>
          <button className={mode === "signup" ? "" : "ghost"} style={{ flex: 1, borderRadius: 0 }} onClick={() => setMode("signup")}>Create</button>
          <button className={mode === "phone" ? "" : "ghost"} style={{ flex: 1, borderRadius: "0 8px 8px 0" }} onClick={() => { setMode("phone"); setCodeSent(false); }}>Text code</button>
        </div>

        {mode === "signup" && (
          <>
            <div className="field">
              <label>Account type</label>
              <div className="row" style={{ gap: 0 }}>
                <button className={type === "vendor" ? "" : "ghost"} style={{ flex: 1, borderRadius: "8px 0 0 8px" }} onClick={() => setType("vendor")}>Vendor / Dealer</button>
                <button className={type === "collector" ? "" : "ghost"} style={{ flex: 1, borderRadius: "0 8px 8px 0" }} onClick={() => setType("collector")}>Collector</button>
              </div>
            </div>
            <div className="field"><label>Your name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div className="field">
              <label>{type === "vendor" ? "Business name" : "Collection name"}</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={type === "vendor" ? "Fulcrum Cards" : "My Collection"} />
            </div>
          </>
        )}

        {mode === "phone" ? (
          <>
            <div className="field"><label>Mobile number</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" />
            </div>
            {codeSent && (
              <div className="field"><label>Text code</label>
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" onKeyDown={(e) => e.key === "Enter" && verifyCode()} />
              </div>
            )}
            {info && <div className="banner good">{info}</div>}
            {error && <div className="banner warn">{error}</div>}
            {!codeSent ? (
              <button style={{ width: "100%" }} disabled={busy || !phone} onClick={sendCode}>{busy ? "Sending…" : "Send code"}</button>
            ) : (
              <div className="row">
                <button className="grow" disabled={busy || !code} onClick={verifyCode}>{busy ? "Verifying…" : "Verify & sign in"}</button>
                <button className="ghost" disabled={busy} onClick={sendCode}>Resend</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>

            {info && <div className="banner good">{info}</div>}
            {error && <div className="banner warn">{error}</div>}

            <button style={{ width: "100%" }} disabled={busy} onClick={submit}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>

            {mode === "signin" && (
              <p className="muted small" style={{ textAlign: "center", marginTop: 10 }}>
                <a onClick={forgotPassword} style={{ cursor: "pointer" }}>Forgot password?</a>
              </p>
            )}
          </>
        )}

        <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}>
          <a onClick={enterLocalDemo} style={{ cursor: "pointer" }}>Continue in local demo →</a>
        </p>
      </div>
    </div>
  );
}

export function OnboardingScreen() {
  const { createOrg, signOut } = useAuth();
  const [type, setType] = useState<AccountType>("vendor");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    const res = await createOrg(name.trim(), type);
    setBusy(false);
    if (res.error) setError(res.error);
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h2>Set up your account</h2>
        <p className="muted small">You're signed in — create your organization to continue.</p>
        <div className="field">
          <label>Account type</label>
          <div className="row" style={{ gap: 0 }}>
            <button className={type === "vendor" ? "" : "ghost"} style={{ flex: 1, borderRadius: "8px 0 0 8px" }} onClick={() => setType("vendor")}>Vendor / Dealer</button>
            <button className={type === "collector" ? "" : "ghost"} style={{ flex: 1, borderRadius: "0 8px 8px 0" }} onClick={() => setType("collector")}>Collector</button>
          </div>
        </div>
        <div className="field"><label>{type === "vendor" ? "Business name" : "Collection name"}</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        {error && <div className="banner warn">{error}</div>}
        <div className="row">
          <button disabled={busy} onClick={go}>{busy ? "Creating…" : "Create organization"}</button>
          <button className="ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
