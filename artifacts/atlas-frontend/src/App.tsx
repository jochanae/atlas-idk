import { useEffect, useRef, useState, lazy, Suspense, Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoadingSpinner } from "./components/ui/loading-spinner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { UnifiedShell } from "@/components/UnifiedShell";

import Home from "./pages/home";
import Landing from "./pages/landing";
import Login from "./pages/login";
// Phase 1: lazy-load workspace — 400 KB+ file splits into its own chunk so the
// home/landing bundle stays small. Suspense boundary in UnifiedShellRoutes below.
const Workspace = lazy(() => import("./pages/workspace"));
import Projects from "./pages/projects";
import Ledger from "./pages/ledger";
import ParkingLot from "./pages/parking-lot";
import KnowledgePage from "./pages/knowledge";
import ComponentRegistryPage from "./pages/component-registry";
import EntryDetail from "./pages/entry-detail";
import CodePage from "./pages/code";
import ConnectorsPage from "./pages/connectors";
import MasterMap from "./pages/master-map";
import RunPage from "./pages/run";

import Terms from "./pages/terms";
import Privacy from "./pages/privacy";
import Pricing from "./pages/pricing";
import Settings from "./pages/settings";
import Help from "./pages/help";
import Admin from "./pages/admin";

import ResetPassword from "./pages/reset-password";
import AuthCallback from "./pages/auth-callback";
import TokenBridge from "./pages/token-bridge";
import { useAuth } from "@/hooks/useAuth";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Error Boundary ────────────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    const mono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };
    return (
      <div style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", background: "var(--atlas-bg)",
        padding: "32px 24px", gap: 20,
      }}>
        <div style={{ fontSize: 11, ...mono, letterSpacing: "0.35em", color: "var(--atlas-gold)", opacity: 0.5, textTransform: "uppercase" }}>
          Axiom
        </div>
        <div style={{ fontSize: 22, fontWeight: 300, color: "var(--atlas-fg)", letterSpacing: "0.04em" }}>
          Something went wrong.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 24px", borderRadius: 9, cursor: "pointer",
            background: "linear-gradient(180deg, #D4AF37 0%, #B8942A 100%)",
            border: "1px solid rgba(212,175,55,0.4)", color: "#0C0A09",
            fontSize: 11, fontWeight: 700, ...mono, letterSpacing: "0.14em", textTransform: "uppercase",
          }}
        >
          Reload
        </button>
        {this.state.message && (
          <p style={{ fontSize: 10, ...mono, color: "var(--atlas-muted)", opacity: 0.4, maxWidth: 480, textAlign: "center", lineHeight: 1.6, marginTop: 8 }}>
            {this.state.message}
          </p>
        )}
      </div>
    );
  }
}


// ── Page Transition Spinner ───────────────────────────────────────────────────
const SKIP_TRANSITION = ["/landing", "/login", "/reset-password"];

function isUnifiedShellPath(pathname: string): boolean {
  return pathname === "/home" || pathname.startsWith("/project/") || pathname.startsWith("/workspace/");
}

function PageTransition() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const prevLocation = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpacity(1);
      setVisible(true);
      timer.current = setTimeout(() => {
        setOpacity(0);
        timer.current = setTimeout(() => setVisible(false), 300);
      }, 400);
    }, 150);
  };

  useEffect(() => {
    // First load
    if (prevLocation.current === null) {
      if (!SKIP_TRANSITION.includes(location)) show();
      prevLocation.current = location;
      return;
    }
    // Route change
    if (prevLocation.current !== location) {
      const stayedInUnifiedShell = isUnifiedShellPath(prevLocation.current) && isUnifiedShellPath(location);
      prevLocation.current = location;
      if (!stayedInUnifiedShell && !SKIP_TRANSITION.includes(location)) show();
    }
  }, [location]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "var(--atlas-bg)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20,
      opacity, transition: opacity === 0 ? "opacity 350ms ease" : "none",
      pointerEvents: "none",
    }}>
      <LoadingSpinner size="lg" />
      <p style={{
        fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
        color: "rgba(201,162,76,0.5)", fontFamily: "var(--app-font-mono)", margin: 0,
      }}>
        thinking strategically
      </p>
    </div>
  );
}


// ── Router ────────────────────────────────────────────────────────────────────
function UnifiedShellRoutes() {
  return (
    <UnifiedShell>
      <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh" }}><LoadingSpinner /></div>}>
        <Switch>
          <Route path="/home" component={Home} />
          <Route path="/atlas/:id" component={() => { const [,nav] = useLocation(); useEffect(() => { try { sessionStorage.setItem("atlas-open-ask","1"); } catch {} nav("/home", { replace: true }); }, []); return null; }} />
          <Route path="/atlas" component={() => { const [,nav] = useLocation(); useEffect(() => { nav("/home", { replace: true }); }, []); return null; }} />
          <Route path="/project/:projectId" component={Workspace} />
          <Route path="/workspace/:conversationId" component={Workspace} />
        </Switch>
      </Suspense>
    </UnifiedShell>
  );
}

function RootRouteGate() {
  const [, nav] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      nav("/landing", { replace: true });
      return;
    }
    // Visiting Atlas should land on the ambient home surface. Project focus is
    // explicit through project selection, not restored from stale localStorage.
    nav("/home", { replace: true });
  }, [isLoading, nav, user]);

  return null;
}

function Router() {
  const [location] = useLocation();

  // Track navigation history so back buttons can return to the actual entry point.
  useEffect(() => {
    import("@/lib/nav-history").then(({ pushNav }) => pushNav(location));
  }, [location]);



  return (
    <>
      {isUnifiedShellPath(location) ? (
        <UnifiedShellRoutes />
      ) : (
        <Switch>
          <Route path="/" component={RootRouteGate} />
          <Route path="/landing" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/auth/callback" component={AuthCallback} />
          <Route path="/auth/token-bridge" component={TokenBridge} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/onboarding" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/projects" component={Projects} />
          <Route path="/ledger" component={Ledger} />
          <Route path="/ledger/:projectId" component={Ledger} />
          <Route path="/parking" component={ParkingLot} />
          <Route path="/knowledge" component={KnowledgePage} />
          <Route path="/component-registry" component={ComponentRegistryPage} />
          <Route path="/guard-report" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/compass" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/entry/:id" component={EntryDetail} />
          <Route path="/sessions" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          
          <Route path="/workshop" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/code" component={CodePage} />
          <Route path="/connectors" component={ConnectorsPage} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/settings" component={Settings} />
          <Route path="/help" component={Help} />
          <Route path="/vault" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/secrets" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/admin" component={Admin} />
          <Route path="/dashboard" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/map" component={MasterMap} />
          <Route path="/master-map" component={MasterMap} />
          <Route path="/nexus" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route path="/runs/:id" component={RunPage} />
          <Route path="/showcase" component={() => { const [,nav] = useLocation(); useEffect(() => nav("/home", { replace: true }), []); return null; }} />
          <Route component={NotFound} />
        </Switch>
      )}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem("atlas-theme");
      if (saved === "parchment") {
        document.documentElement.dataset.theme = "parchment";
      }
    } catch {}
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => {
      try {
        return localStorage.getItem("atlas-auth-token");
      } catch {
        return null;
      }
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <PageTransition />
            <Router />
          </WouterRouter>
        </ErrorBoundary>
        <Toaster richColors closeButton position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
// cache-bust Tue Jun  2 01:02:28 AM UTC 2026
