# Auth features — biometric sign-on & SMS codes

Status of the two requested features and what each needs.

## 1. SMS / text-message codes (BUILT — needs a provider)

**In-app: done.** The login screen has a **"Text code"** tab: enter mobile number → receive
a 6-digit code by SMS → verify → signed in. Also serves as text-based account recovery.
Password reset by **email** is wired now too ("Forgot password?").

**What you must configure (off-app):**
- A Supabase **SMS provider** (recommended **Twilio**): Supabase → **Authentication →
  Providers → Phone** → enable, then paste Twilio Account SID, Auth Token, and a Messaging
  Service / from-number.
- Twilio account + a phone number (per-SMS cost). The in-app flow lights up automatically
  once this is set; until then it returns a "provider not configured" error.

**Note on linking:** SMS sign-in works for accounts that have a verified phone number. For
users who signed up by email, we'll add an "add & verify phone" step in account settings so
they can opt into SMS login (small follow-up). New users can sign up by phone directly.

## 2. Device biometric sign-on — passkeys / WebAuthn (PLANNED)

"Use Face ID / Touch ID / Windows Hello / fingerprint" in a web app = **passkeys (WebAuthn)**.
Supabase doesn't yet offer first-class passkey *login*, so the proper version needs a small
**server function** (Supabase Edge Function) to:
1. issue a WebAuthn challenge, 2. verify the signed biometric assertion, 3. mint a Supabase
session for the matched user.

We'll already be standing up Edge Functions for Stripe webhooks, so passkeys slot in there.

**DECIDED (2026-06-04): full passkeys, built with the Edge Functions milestone.** True
biometric login (Face ID/Touch ID/Windows Hello), cross-session and phishing-resistant, via
WebAuthn + the verification Edge Function described above. No third-party account or cost —
just the function deployment, which we're doing anyway for Stripe webhooks. (Interim
"biometric lock over saved session" was considered and skipped in favor of doing it right.)

## 3. Email confirmation (testing)

For fast testing, disable Supabase → **Authentication → Providers → Email → "Confirm email"**
(or Authentication → Settings). The app already handles the confirm-on flow gracefully (shows
"check your email", finishes org setup on first confirmed sign-in).
