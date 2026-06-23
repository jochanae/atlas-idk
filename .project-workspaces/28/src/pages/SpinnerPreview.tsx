import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function SpinnerPreview() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-16 p-8">
      <h1 className="text-2xl font-display font-bold text-foreground">Loading Spinner Preview</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
        {(["gold", "brand", "emerald"] as const).map((scheme) => (
          <div key={scheme} className="flex flex-col items-center gap-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{scheme}</p>
            <div className="rounded-2xl bg-card border border-border p-10 flex items-center justify-center" style={{ minHeight: 220, minWidth: 220 }}>
              <LoadingSpinner size="lg" colorScheme={scheme} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
        {(["gold", "brand", "emerald"] as const).map((scheme) => (
          <div key={scheme} className="flex flex-col items-center gap-4">
            <p className="text-xs text-muted-foreground">Small with text</p>
            <LoadingSpinner size="sm" colorScheme={scheme} text="Loading…" />
          </div>
        ))}
      </div>
    </div>
  );
}
