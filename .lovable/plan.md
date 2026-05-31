# Switch frontend auth to Supabase

Memory currently locks "backend = Neon + custom backend, do NOT introduce supabase.auth.\*". You've explicitly overridden that. I'll update memory to: **frontend auth = Supabase (Google + Apple + email/password); backend stays Neon and validates the Supabase JWT with `jose`.**

## What changes

### 1. Enable providers in Supabase
- Call `supabase--configure_social_auth` with `providers: ["google", "apple"]` (email stays enabled).
- Without this, the first Google/Apple sign-in fails with "Unsupported provider".
- Apple BYOC credentials (Services ID, Key ID, Team ID, .p8) are a separate manual step in Cloud → Auth Settings → Apple. I'll flag this; managed Google works out of the box.

### 2. Rewrite `src/pages/login.tsx`
- Email/password sign-in + sign-up via `supabase.auth.signInWithPassword` / `signUp` (with `emailRedirectTo: window.location.origin`).
- "Continue with Google" → `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`.
- "Continue with Apple" → `lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin })`.
- On success, navigate to `/home`.

### 3. Rewrite `src/hooks/useAuth.ts`
- Replace `fetchMe()` (which hits `/api/auth/me` on the custom backend) with:
  - `supabase.auth.getUser()` for the initial check.
  - `supabase.auth.onAuthStateChange` listener that updates the `["auth","me"]` query cache.
- Derive `AuthUser` from `user.user_metadata` + a lightweight `profiles` row lookup if present (project already has a `profiles` table). Fields like `role` / `subscriptionTier` default to `"user"` / `"free"` until the backend syncs them.
- `useLogout` → `supabase.auth.signOut()` then navigate to `/login`.

### 4. Update `src/lib/api.ts`
- `getAuthHeaders()` becomes async: read `supabase.auth.getSession()`, return `{ Authorization: \`Bearer ${access_token}\` }`.
- Remove `localStorage.getItem("atlas-token")` path.
- Add a tiny `authedFetch(path, init)` helper so callers don't have to await headers manually. Existing call sites that already call `getAuthHeaders()` synchronously will be migrated to `await getAuthHeaders()` or `authedFetch`.

### 5. Retire the old OAuth exchange
- `src/pages/auth-callback.tsx` was for the custom backend's `/api/auth/session/exchange?token=...` flow. Supabase's OAuth redirect lands back on `window.location.origin` and the SDK picks up the session automatically — no callback page needed.
- Keep the route as a thin redirect to `/home` so any stale links don't 404.

### 6. Memory update
- Replace the locked rule "backend = Neon + custom backend (NOT Supabase). Auth goes through user's own backend at `/api/auth/*`" with: "Frontend auth = Supabase (Google + Apple + email/password). Backend = Neon at `https://www.axiomsystem.app`; it validates the Supabase JWT with `jose`. Frontend attaches `Authorization: Bearer <supabase access_token>` to every API call."

## What I will NOT touch
- The Neon backend itself. You'll add the `jose` middleware on Cloud Run separately.
- Anything under `src/integrations/supabase/*` (auto-generated).
- Subscription/Stripe hooks beyond what's needed for the `tier` field on `AuthUser`.

## Risk / blocker
- Any backend endpoint still expecting the **old** session cookie (not Bearer) will 401 until you ship the `jose` middleware. The frontend will be fully on Supabase the moment I push; the backend has to catch up.
- Apple sign-in won't work until you finish Apple Developer setup (Services ID + .p8) and paste credentials into Cloud → Auth Settings → Apple. Google works immediately.

Approve and I'll execute.
