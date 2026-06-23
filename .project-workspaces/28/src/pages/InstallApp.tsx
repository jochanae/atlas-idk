import { useState, useEffect } from "react";
import { Download, Smartphone, Monitor, CheckCircle, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">Already Installed!</h1>
            <p className="text-muted-foreground">PresentQ is installed on your device. Open it from your home screen for the best experience.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Download className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Install PresentQ</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Get the full app experience — works offline, loads instantly, and feels native.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full gap-2" size="lg">
              <Download className="w-5 h-5" />
              Install Now
            </Button>
          ) : isIOS ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" /> Install on iOS
              </h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Tap the <Share className="w-4 h-4 inline" /> Share button in Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> to install</li>
              </ol>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" /> Install on Desktop
              </h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Click the install icon in your browser's address bar</li>
                <li>Or open browser menu → <strong>"Install PresentQ"</strong></li>
              </ol>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: "⚡", label: "Fast" },
              { icon: "📴", label: "Offline" },
              { icon: "🔔", label: "Alerts" },
            ].map(f => (
              <div key={f.label} className="text-center p-3 rounded-lg bg-secondary/50">
                <span className="text-2xl">{f.icon}</span>
                <p className="text-xs font-medium text-muted-foreground mt-1">{f.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
