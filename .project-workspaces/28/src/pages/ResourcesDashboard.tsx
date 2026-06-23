import { useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useAudienceResources } from "@/hooks/useAudienceResources";
import { useFollowUpTemplates } from "@/hooks/useFollowUpTemplates";
import { usePresentationCtas } from "@/hooks/usePresentationCtas";
import { useSchedulingLinks } from "@/hooks/useSchedulingLinks";
import { useLeadMagnets } from "@/hooks/useLeadMagnets";
import { useSurveys } from "@/hooks/useSurveys";
import { useDownloadGates } from "@/hooks/useDownloadGates";
import { useLowerThirds } from "@/hooks/useLowerThirds";
import { useApprovedImages } from "@/hooks/useApprovedImages";
import { usePresentations } from "@/hooks/usePresentations";
import { useNavigate } from "react-router-dom";
import {
  FileDown, Mail, Link2, Calendar, Magnet, Lock, ClipboardList,
  Subtitles, Image, CheckCircle2, AlertTriangle, Package, ArrowRight,
} from "lucide-react";

/* ---- Category definition ---- */
interface Category {
  key: string;
  label: string;
  icon: any;
  count: number;
  route: string;
  color: string;
}

export default function ResourcesDashboard() {
  const resources = useAudienceResources();
  const templates = useFollowUpTemplates();
  const ctas = usePresentationCtas();
  const scheduling = useSchedulingLinks();
  const magnets = useLeadMagnets();
  const surveys = useSurveys();
  const gates = useDownloadGates();
  const lowerThirds = useLowerThirds();
  const approvedImages = useApprovedImages();
  const { data: presentations } = usePresentations();

  const categories: Category[] = useMemo(() => [
    { key: "audience", label: "Audience Resources", icon: FileDown, count: resources.data?.length ?? 0, route: "/resources", color: "text-blue-500" },
    { key: "templates", label: "Email Templates", icon: Mail, count: templates.data?.length ?? 0, route: "/follow-up", color: "text-violet-500" },
    { key: "ctas", label: "CTA Links", icon: Link2, count: ctas.data?.length ?? 0, route: "/follow-up", color: "text-emerald-500" },
    { key: "scheduling", label: "Scheduling Links", icon: Calendar, count: scheduling.data?.length ?? 0, route: "/follow-up", color: "text-orange-500" },
    { key: "magnets", label: "Lead Magnets", icon: Magnet, count: magnets.data?.length ?? 0, route: "/follow-up", color: "text-rose-500" },
    { key: "gates", label: "Download Gates", icon: Lock, count: gates.data?.length ?? 0, route: "/follow-up", color: "text-amber-500" },
    { key: "surveys", label: "Surveys", icon: ClipboardList, count: surveys.data?.length ?? 0, route: "/follow-up", color: "text-cyan-500" },
    { key: "lower", label: "Lower Thirds", icon: Subtitles, count: lowerThirds.data?.length ?? 0, route: "/visual-assets", color: "text-pink-500" },
    { key: "images", label: "Approved Images", icon: Image, count: approvedImages.data?.length ?? 0, route: "/visual-assets", color: "text-teal-500" },
  ], [resources.data, templates.data, ctas.data, scheduling.data, magnets.data, gates.data, surveys.data, lowerThirds.data, approvedImages.data]);

  const totalAssets = categories.reduce((s, c) => s + c.count, 0);
  const filledCategories = categories.filter(c => c.count > 0).length;
  const progressPct = Math.round((filledCategories / categories.length) * 100);

  /* ---- Per-presentation readiness ---- */
  const presentationReadiness = useMemo(() => {
    if (!presentations) return [];
    return presentations.slice(0, 6).map((p: any) => {
      const pResources = resources.data?.filter((r: any) => r.presentation_id === p.id) ?? [];
      const pCtas = ctas.data?.filter((c: any) => c.presentation_id === p.id) ?? [];
      const pTemplates = templates.data?.filter((t: any) => t.presentation_id === p.id) ?? [];
      const hasCta = pCtas.length > 0;
      const hasResource = pResources.length > 0;
      const hasTemplate = pTemplates.length > 0;
      const checks = [hasCta, hasResource, hasTemplate];
      const done = checks.filter(Boolean).length;
      return { id: p.id, title: p.title, done, total: checks.length, hasCta, hasResource, hasTemplate };
    });
  }, [presentations, resources.data, ctas.data, templates.data]);

  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Resources Overview</h1>
            <p className="text-muted-foreground text-sm">Everything your audience and you need — before, during, and after</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              <Package className="w-3.5 h-3.5 mr-1.5" />{totalAssets} total assets
            </Badge>
          </div>
        </div>

        {/* Overall progress */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Category Coverage</p>
              <span className="text-xs text-muted-foreground">{filledCategories} of {categories.length} categories populated</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </CardContent>
        </Card>

        {/* Category cards grid */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {categories.map(cat => (
            <Card
              key={cat.key}
              className="cursor-pointer hover:border-primary/40 transition-colors group"
              onClick={() => navigate(cat.route)}
            >
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center ${cat.color}`}>
                    <cat.icon className="w-4.5 h-4.5" />
                  </div>
                  <Badge variant={cat.count > 0 ? "default" : "outline"} className="text-[10px]">
                    {cat.count}
                  </Badge>
                </div>
                <p className="text-sm font-medium leading-tight">{cat.label}</p>
                <div className="flex items-center gap-1 text-xs">
                  {cat.count > 0 ? (
                    <span className="text-emerald-500 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Active</span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Empty</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Per-presentation readiness */}
        {presentationReadiness.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Presentation Readiness</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presentationReadiness.map(p => (
                <Card key={p.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <Badge variant={p.done === p.total ? "default" : "outline"} className="text-[10px] shrink-0">
                        {p.done === p.total ? "Ready to Share" : `${p.done} of ${p.total}`}
                      </Badge>
                    </div>
                    <Progress value={(p.done / p.total) * 100} className="h-1.5" />
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={p.hasResource ? "default" : "outline"} className="text-[9px]">
                        {p.hasResource ? "✓" : "✗"} Resource
                      </Badge>
                      <Badge variant={p.hasCta ? "default" : "outline"} className="text-[9px]">
                        {p.hasCta ? "✓" : "✗"} CTA
                      </Badge>
                      <Badge variant={p.hasTemplate ? "default" : "outline"} className="text-[9px]">
                        {p.hasTemplate ? "✓" : "✗"} Follow-Up
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
