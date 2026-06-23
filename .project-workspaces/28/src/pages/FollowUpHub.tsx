import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFollowUpTemplates } from "@/hooks/useFollowUpTemplates";
import { usePresentationCtas } from "@/hooks/usePresentationCtas";
import { useSchedulingLinks } from "@/hooks/useSchedulingLinks";
import { useLeadMagnets } from "@/hooks/useLeadMagnets";
import { useSurveys } from "@/hooks/useSurveys";
import { useDownloadGates } from "@/hooks/useDownloadGates";
import { toast } from "sonner";
import { Mail, Link2, Calendar, Magnet, Lock, ClipboardList, Plus, Trash2, ExternalLink, ToggleLeft } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Reusable empty state                                               */
/* ------------------------------------------------------------------ */
const EmptyState = ({ icon: Icon, title, description, onAdd }: { icon: any; title: string; description: string; onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-primary" />
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-muted-foreground text-sm max-w-sm mb-6">{description}</p>
    <Button onClick={onAdd}><Plus className="w-4 h-4 mr-2" />Add First</Button>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Item card                                                          */
/* ------------------------------------------------------------------ */
const ItemCard = ({ title, subtitle, active, onToggle, onDelete, extra }: {
  title: string; subtitle?: string; active?: boolean; onToggle?: () => void; onDelete: () => void; extra?: React.ReactNode;
}) => (
  <Card className="group">
    <CardContent className="flex items-center justify-between p-4 gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        {extra}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onToggle !== undefined && (
          <Switch checked={active} onCheckedChange={onToggle} />
        )}
        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </CardContent>
  </Card>
);

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */
export default function FollowUpHub() {
  const templates = useFollowUpTemplates();
  const ctas = usePresentationCtas();
  const scheduling = useSchedulingLinks();
  const magnets = useLeadMagnets();
  const surveys = useSurveys();
  const gates = useDownloadGates();

  /* ---- quick-add dialogs ---- */
  const [addingTab, setAddingTab] = useState<string | null>(null);

  /* form state (shared simple form) */
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formType, setFormType] = useState("follow_up");

  const resetForm = () => { setFormName(""); setFormUrl(""); setFormBody(""); setFormType("follow_up"); setAddingTab(null); };

  const handleAdd = async () => {
    try {
      if (addingTab === "templates") {
        await templates.create.mutateAsync({ name: formName || "Untitled", subject: formUrl, body: formBody, template_type: formType });
      } else if (addingTab === "ctas") {
        await ctas.create.mutateAsync({ label: formName || "Learn More", url: formUrl, cta_type: formType });
      } else if (addingTab === "scheduling") {
        await scheduling.create.mutateAsync({ label: formName || "Book a Call", url: formUrl, provider: formType });
      } else if (addingTab === "magnets") {
        await magnets.create.mutateAsync({ title: formName || "Free Download", description: formBody, external_url: formUrl, magnet_type: formType });
      } else if (addingTab === "surveys") {
        await surveys.create.mutateAsync({ title: formName || "Feedback Form", questions: [] });
      } else if (addingTab === "gates") {
        await gates.create.mutateAsync({ gate_type: formType, custom_message: formBody || "Enter your email to download" });
      }
      toast.success("Created successfully");
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  /* ---- tab config ---- */
  const tabs = [
    { id: "templates", label: "Email Templates", icon: Mail, count: templates.data?.length ?? 0 },
    { id: "ctas", label: "CTAs", icon: Link2, count: ctas.data?.length ?? 0 },
    { id: "scheduling", label: "Scheduling", icon: Calendar, count: scheduling.data?.length ?? 0 },
    { id: "magnets", label: "Lead Magnets", icon: Magnet, count: magnets.data?.length ?? 0 },
    { id: "gates", label: "Download Gates", icon: Lock, count: gates.data?.length ?? 0 },
    { id: "surveys", label: "Surveys", icon: ClipboardList, count: surveys.data?.length ?? 0 },
  ];

  const totalAssets = tabs.reduce((s, t) => s + t.count, 0);

  /* ---- dialog form fields per tab ---- */
  const dialogFields: Record<string, { nameLabel: string; namePlaceholder: string; urlLabel?: string; urlPlaceholder?: string; bodyLabel?: string; typeOptions?: { value: string; label: string }[] }> = {
    templates: { nameLabel: "Template Name", namePlaceholder: "Post-webinar follow-up", urlLabel: "Subject Line", urlPlaceholder: "Thanks for attending!", bodyLabel: "Email Body", typeOptions: [{ value: "follow_up", label: "Follow-Up" }, { value: "thank_you", label: "Thank You" }, { value: "nurture", label: "Nurture" }] },
    ctas: { nameLabel: "Button Label", namePlaceholder: "Get Started", urlLabel: "Destination URL", urlPlaceholder: "https://...", typeOptions: [{ value: "link", label: "Link" }, { value: "button", label: "Button" }, { value: "banner", label: "Banner" }] },
    scheduling: { nameLabel: "Link Label", namePlaceholder: "Book a Strategy Call", urlLabel: "Scheduling URL", urlPlaceholder: "https://calendly.com/...", typeOptions: [{ value: "calendly", label: "Calendly" }, { value: "cal", label: "Cal.com" }, { value: "other", label: "Other" }] },
    magnets: { nameLabel: "Title", namePlaceholder: "Free Cheat Sheet", urlLabel: "URL or File Link", urlPlaceholder: "https://...", bodyLabel: "Description", typeOptions: [{ value: "pdf", label: "PDF" }, { value: "ebook", label: "eBook" }, { value: "checklist", label: "Checklist" }, { value: "video", label: "Video" }] },
    surveys: { nameLabel: "Survey Title", namePlaceholder: "How was the presentation?" },
    gates: { nameLabel: "Gate Type", namePlaceholder: "email", bodyLabel: "Custom Message", typeOptions: [{ value: "email", label: "Email Required" }, { value: "email_name", label: "Email + Name" }] },
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Follow-Up & Conversion</h1>
            <p className="text-muted-foreground text-sm">Everything your audience needs after the presentation</p>
          </div>
          <Badge variant="secondary" className="text-sm">{totalAssets} asset{totalAssets !== 1 ? "s" : ""}</Badge>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 text-xs">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{t.count}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Email Templates */}
          <TabsContent value="templates" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("templates")}><Plus className="w-4 h-4 mr-1" />New Template</Button>
            </div>
            {(templates.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Mail} title="No email templates yet" description="Create follow-up email templates to send after your presentations." onAdd={() => setAddingTab("templates")} />
            ) : templates.data?.map((t: any) => (
              <ItemCard key={t.id} title={t.name} subtitle={t.subject} onDelete={() => { templates.remove.mutate(t.id); toast.success("Deleted"); }} extra={<Badge variant="outline" className="mt-1 text-[10px]">{t.template_type}</Badge>} />
            ))}
          </TabsContent>

          {/* CTAs */}
          <TabsContent value="ctas" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("ctas")}><Plus className="w-4 h-4 mr-1" />New CTA</Button>
            </div>
            {(ctas.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Link2} title="No CTAs yet" description="Add call-to-action links for your audience to click after watching." onAdd={() => setAddingTab("ctas")} />
            ) : ctas.data?.map((c: any) => (
              <ItemCard key={c.id} title={c.label} subtitle={c.url} active={c.is_active}
                onToggle={() => ctas.update.mutate({ id: c.id, is_active: !c.is_active })}
                onDelete={() => { ctas.remove.mutate(c.id); toast.success("Deleted"); }} />
            ))}
          </TabsContent>

          {/* Scheduling */}
          <TabsContent value="scheduling" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("scheduling")}><Plus className="w-4 h-4 mr-1" />New Link</Button>
            </div>
            {(scheduling.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Calendar} title="No scheduling links" description="Attach Calendly or booking links so your audience can book with you." onAdd={() => setAddingTab("scheduling")} />
            ) : scheduling.data?.map((s: any) => (
              <ItemCard key={s.id} title={s.label} subtitle={s.url} active={s.is_active}
                onToggle={() => scheduling.update.mutate({ id: s.id, is_active: !s.is_active })}
                onDelete={() => { scheduling.remove.mutate(s.id); toast.success("Deleted"); }}
                extra={<Badge variant="outline" className="mt-1 text-[10px]">{s.provider}</Badge>} />
            ))}
          </TabsContent>

          {/* Lead Magnets */}
          <TabsContent value="magnets" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("magnets")}><Plus className="w-4 h-4 mr-1" />New Magnet</Button>
            </div>
            {(magnets.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Magnet} title="No lead magnets" description="Offer free downloads, cheat sheets, or ebooks to capture leads." onAdd={() => setAddingTab("magnets")} />
            ) : magnets.data?.map((m: any) => (
              <ItemCard key={m.id} title={m.title} subtitle={m.description} active={m.is_active}
                onToggle={() => magnets.update.mutate({ id: m.id, is_active: !m.is_active })}
                onDelete={() => { magnets.remove.mutate(m.id); toast.success("Deleted"); }}
                extra={<Badge variant="outline" className="mt-1 text-[10px]">{m.magnet_type}</Badge>} />
            ))}
          </TabsContent>

          {/* Download Gates */}
          <TabsContent value="gates" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("gates")}><Plus className="w-4 h-4 mr-1" />New Gate</Button>
            </div>
            {(gates.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Lock} title="No download gates" description="Require an email before your audience can download resources." onAdd={() => setAddingTab("gates")} />
            ) : gates.data?.map((g: any) => (
              <ItemCard key={g.id} title={g.gate_type === "email_name" ? "Email + Name" : "Email Required"} subtitle={g.custom_message} active={g.is_active}
                onToggle={() => gates.update.mutate({ id: g.id, is_active: !g.is_active })}
                onDelete={() => { gates.remove.mutate(g.id); toast.success("Deleted"); }} />
            ))}
          </TabsContent>

          {/* Surveys */}
          <TabsContent value="surveys" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddingTab("surveys")}><Plus className="w-4 h-4 mr-1" />New Survey</Button>
            </div>
            {(surveys.data?.length ?? 0) === 0 ? (
              <EmptyState icon={ClipboardList} title="No surveys yet" description="Collect feedback from your audience after presentations." onAdd={() => setAddingTab("surveys")} />
            ) : surveys.data?.map((s: any) => (
              <ItemCard key={s.id} title={s.title} subtitle={`${(s.questions as any[])?.length ?? 0} questions`} active={s.is_active}
                onToggle={() => surveys.update.mutate({ id: s.id, is_active: !s.is_active })}
                onDelete={() => { surveys.remove.mutate(s.id); toast.success("Deleted"); }} />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* ---- Universal Add Dialog ---- */}
      <Dialog open={!!addingTab} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addingTab ? tabs.find(t => t.id === addingTab)?.label : ""}</DialogTitle>
          </DialogHeader>
          {addingTab && dialogFields[addingTab] && (
            <div className="space-y-4">
              <div>
                <Label>{dialogFields[addingTab].nameLabel}</Label>
                <Input placeholder={dialogFields[addingTab].namePlaceholder} value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              {dialogFields[addingTab].urlLabel && (
                <div>
                  <Label>{dialogFields[addingTab].urlLabel}</Label>
                  <Input placeholder={dialogFields[addingTab].urlPlaceholder} value={formUrl} onChange={e => setFormUrl(e.target.value)} />
                </div>
              )}
              {dialogFields[addingTab].bodyLabel && (
                <div>
                  <Label>{dialogFields[addingTab].bodyLabel}</Label>
                  <Textarea placeholder="Write here..." value={formBody} onChange={e => setFormBody(e.target.value)} rows={4} />
                </div>
              )}
              {dialogFields[addingTab].typeOptions && (
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dialogFields[addingTab].typeOptions!.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button className="w-full" onClick={handleAdd} disabled={templates.create.isPending || ctas.create.isPending || scheduling.create.isPending || magnets.create.isPending || surveys.create.isPending || gates.create.isPending}>
                Create
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
