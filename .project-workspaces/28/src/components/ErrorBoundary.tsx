import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Send, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  userNote: string;
  submitting: boolean;
  submitted: boolean;
  showDebug: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      userNote: "",
      submitting: false,
      submitted: false,
      showDebug: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught:", error, errorInfo);

    // Report to Sentry
    captureError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      pageUrl: window.location.href,
    });
  }

  handleSubmitReport = async () => {
    this.setState({ submitting: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("bug_reports" as any).insert({
        user_id: user?.id ?? null,
        error_message: this.state.error?.message?.slice(0, 2000) || "Unknown error",
        error_stack: this.state.error?.stack?.slice(0, 4000) || null,
        component_stack: this.state.errorInfo?.componentStack?.slice(0, 4000) || null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      } as any);

      if (error) throw error;
      this.setState({ submitted: true });
      toast.success("Bug report submitted — thank you!");
    } catch {
      toast.error("Failed to submit report");
    } finally {
      this.setState({ submitting: false });
    }
  };

  handleReturnHome = () => {
    window.location.href = "/";
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mt-1">
              An unexpected error occurred. You can help us fix it by submitting a report.
            </p>
          </div>

          {/* Error preview */}
          <div className="bg-card border border-border rounded-xl p-3 text-left">
            <p className="text-xs font-mono text-destructive/80 break-all line-clamp-3">
              {this.state.error?.message || "Unknown error"}
            </p>
          </div>

          {/* Report form or success */}
          {this.state.submitted ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <p className="text-sm text-primary font-medium">✓ Report submitted</p>
              <p className="text-xs text-muted-foreground mt-1">Our team will look into this.</p>
            </div>
          ) : (
            <Button
              onClick={this.handleSubmitReport}
              disabled={this.state.submitting}
              className="w-full gap-2"
            >
              <Send className="w-4 h-4" />
              {this.state.submitting ? "Submitting..." : "Report Issue"}
            </Button>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReturnHome} className="flex-1 gap-2">
              <Home className="w-4 h-4" /> Return Home
            </Button>
            <Button variant="outline" onClick={this.handleReload} className="flex-1 gap-2">
              <RefreshCw className="w-4 h-4" /> Reload Page
            </Button>
          </div>

          {/* Collapsible debug info */}
          <div className="border border-border rounded-xl overflow-hidden text-left">
            <button
              onClick={() => this.setState({ showDebug: !this.state.showDebug })}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Debug Info
              {this.state.showDebug ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {this.state.showDebug && (
              <div className="px-4 pb-3 space-y-2 max-h-60 overflow-y-auto">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Error</p>
                  <pre className="text-[11px] font-mono text-destructive/70 whitespace-pre-wrap break-all">
                    {this.state.error?.message}
                  </pre>
                </div>
                {this.state.error?.stack && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Stack</p>
                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Component Stack</p>
                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
