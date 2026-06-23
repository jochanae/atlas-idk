import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileDown, Download, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { RESOURCE_TYPES, type AudienceResource } from "@/hooks/useAudienceResources";
import { toast } from "sonner";

export default function PublicResources() {
  const { id } = useParams<{ id: string }>();
  const [resources, setResources] = useState<AudienceResource[]>([]);
  const [presTitle, setPresTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Get presentation title
      const { data: pres } = await supabase
        .from("presentations")
        .select("title")
        .eq("id", id)
        .eq("is_public", true)
        .single();

      if (!pres) {
        setError("Presentation not found or not public");
        setLoading(false);
        return;
      }
      setPresTitle(pres.title);

      // Get public resources for this presentation
      const { data } = await supabase
        .from("audience_resources" as any)
        .select("*")
        .eq("presentation_id", id)
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      setResources((data ?? []) as unknown as AudienceResource[]);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Loading resources...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <FileDown className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Audience Resources</h1>
          <p className="text-sm text-muted-foreground">{presTitle}</p>
        </div>

        {/* Resources list */}
        {resources.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileDown className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No resources available for this presentation.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map((r) => {
              const typeLabel = RESOURCE_TYPES.find((t) => t.value === r.resource_type)?.label || r.resource_type;
              const link = r.file_url || r.external_url;
              return (
                <div key={r.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/20 transition-all">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileDown className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm">{r.title}</h3>
                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                    <Badge variant="secondary" className="text-[10px] mt-1.5 px-1.5 py-0">{typeLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {link && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5" asChild>
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            {r.file_url ? <Download className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                            {r.file_url ? "Download" : "Open"}
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by PresentQ
        </p>
      </div>
    </div>
  );
}
