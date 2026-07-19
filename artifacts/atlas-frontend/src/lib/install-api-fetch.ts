// Global fetch shim: rewrites bare "/api/*" calls to the external backend
// (API_BASE) and attaches the stored bearer token when present.
// This is installed once at app bootstrap so legacy call sites that use
// `fetch("/api/...")` reach the real backend instead of the preview origin.
import { API_BASE } from "./api";
import { logEvent as _adbgLog } from "./attachDebugLog";

declare global {
  interface Window {
    __atlasFetchPatched?: boolean;
  }
}

// Attachment endpoints are silenced here because a transient 401
// (race between file-picker return and auth-session settling) must
// NEVER hard-redirect to /login and wipe the composer.  The upload
// service handles auth failures locally: it retries once after the
// auth-settle window and, on a second failure, marks only the
// affected file as failed (retryable chip) while preserving text
// and all other staged files.
const SILENT_401_PATTERNS = [
  "/api/nexus/activity",
  "/api/nexus/briefing",
  "/api/stripe/",
  "/api/connections",
  "/api/attachments",
];

let _401redirectPending = false;

if (typeof window !== "undefined" && !window.__atlasFetchPatched) {
  const originalFetch = window.fetch.bind(window);

  const rewriteUrl = (input: RequestInfo | URL): RequestInfo | URL => {
    try {
      if (typeof input === "string") {
        if (input.startsWith("/api/")) return `${API_BASE}${input}`;
        return input;
      }
      if (input instanceof URL) {
        if (input.origin === window.location.origin && input.pathname.startsWith("/api/")) {
          return new URL(input.pathname + input.search + input.hash, API_BASE);
        }
        return input;
      }
      // Request object
      if (input instanceof Request) {
        const u = new URL(input.url);
        if (u.origin === window.location.origin && u.pathname.startsWith("/api/")) {
          const newUrl = `${API_BASE}${u.pathname}${u.search}${u.hash}`;
          return new Request(newUrl, input);
        }
        return input;
      }
    } catch {
      // fall through
    }
    return input;
  };

  const isViteInternal = (input: RequestInfo | URL): boolean => {
    try {
      const s = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      return s.startsWith("/@vite") || s.startsWith("/__vite") || s.startsWith("/@fs") || s.startsWith("/@id");
    } catch {}
    return false;
  };

  const isApiTarget = (input: RequestInfo | URL): boolean => {
    try {
      if (typeof input === "string") {
        if (input.startsWith("/api/")) return true;
        if (input.startsWith(API_BASE + "/api/")) return true;
        return false;
      }
      if (input instanceof URL) return input.href.startsWith(API_BASE + "/api/");
      if (input instanceof Request) return input.url.startsWith(API_BASE + "/api/");
    } catch {}
    return false;
  };

  // Read the best available auth token:
  // 1. Our own session token (custom email/password login)
  // 2. Supabase session token (Lovable / Supabase login flow)
  //    Supabase stores sessions as: sb-<projectRef>-auth-token → { access_token, ... }
  const getEffectiveToken = (): string | null => {
    try {
      const atlasToken = localStorage.getItem("atlas-auth-token");
      if (atlasToken) return atlasToken;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /^sb-[a-z0-9]+-auth-token$/.test(key)) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const session = JSON.parse(raw);
              const token = session?.access_token;
              if (typeof token === "string" && token.length > 0) return token;
            }
          } catch {}
        }
      }
    } catch {}
    return null;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isViteInternal(input)) return originalFetch(input as RequestInfo, init);
    const target = rewriteUrl(input);
    let nextInit = init;
    if (isApiTarget(target)) {
      const token = getEffectiveToken();
      const headers = new Headers(init?.headers ?? (target instanceof Request ? target.headers : undefined));
      if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      nextInit = {
        ...(init ?? {}),
        credentials: init?.credentials ?? "include",
        headers,
      };
    }
    const res = await originalFetch(target as RequestInfo, nextInit);

    if (res.status === 401) {
      const urlStr =
        typeof target === "string"
          ? target
          : target instanceof URL
            ? target.toString()
            : target.url;
      if (urlStr.includes("/api/") && !urlStr.includes("/api/auth/")) {
        const isSilent = SILENT_401_PATTERNS.some((p) => urlStr.includes(p));
        const alreadyOnLogin = window.location.pathname.includes("/login");
        _adbgLog("api_401", { url: urlStr.split("/api/")[1] ?? urlStr, silent: isSilent, alreadyOnLogin });
        if (!isSilent && !alreadyOnLogin && !_401redirectPending) {
          _401redirectPending = true;
          setTimeout(async () => {
            try {
              const baseUrl = API_BASE || window.location.origin;
              _adbgLog("auth_me_recheck_start");
              const check = await originalFetch(`${baseUrl}/api/auth/me`, { credentials: "include" });
              if (check.status === 401) {
                _adbgLog("auth_me_401_redirecting");
                const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                window.location.href = `${base}/login?reason=session_expired`;
              } else {
                _adbgLog("auth_me_ok_no_redirect");
                _401redirectPending = false;
              }
            } catch {
              _adbgLog("auth_me_check_failed");
              _401redirectPending = false;
            }
          }, 1500);
        }
      }
    }

    return res;
  };

  window.__atlasFetchPatched = true;
}

export {};
