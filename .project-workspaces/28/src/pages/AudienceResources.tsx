import { useState, useRef } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FileDown, Plus, Trash2, ExternalLink, Upload, Loader2, Globe, Lock, Link2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAudienceResources,
  useCreateAudienceResource,
  useDeleteAudienceResource,
  uploadResourceFile,
  RESOURCE_TYPES,
  type AudienceResource,
} from "@/hooks/useAudienceResources";
import { usePresentations } from "@/hooks/usePresentations";
import { toast } from "sonner";
import { format } from "date-fns";

function ResourceTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    pdf: "bg-rose-500/10 text-rose-500",
    summary: "bg-blue-500/10 text-blue-500",
    checklist: "bg-emerald-500/10 text-emerald-500",
    worksheet: "bg-amber-500/10 text-amber-500",
    reflection: "bg-purple-500/10 text-purple-500",
    "action-plan": "bg-teal-500/10 text-teal-500",
    "qr-handout": "bg-indigo-500/10 text-indigo-500",
    "replay-link": "bg-orange-500/10 text-orange-500",
    other: "bg-muted text-muted-foreground",
  };
  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors[type] || colors.other}`}>
      <FileDown className="w-4 h-4" />
    </div>
  );
}

function CreateResourceDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("pdf");
  const [externalUrl, setExternalUrl] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [presentationId, setPresentationId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = useCreateAudienceResource();
  const { data: presentations = [] } = usePresentations();

  const isLinkType = resourceType === "replay-link";

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20 MB");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadResourceFile(file);
      setFileUrl(url);
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success("File uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      resource_type: resourceType,
      presentation_id: presentationId || undefined,
      file_url: fileUrl || undefined,
      external_url: externalUrl.trim() || undefined,
      is_public: isPublic,
    });
    setOpen(false);
    setTitle(""); setDescription(""); setResourceType("pdf"); setExternalUrl(""); setIsPublic(false); setPresentationId(""); setFileUrl(null); setFileName(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            New Audience Resource
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">Resource Type</Label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Key Takeaways PDF" />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description for your audience..." className="min-h-[60px]" />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Link to Presentation (optional)</Label>
            <Select value={presentationId} onValueChange={setPresentationId}>
              <SelectTrigger><SelectValue placeholder="None — standalone resource" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {presentations.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLinkType ? (
            <div>
              <Label className="text-xs mb-1.5 block">URL</Label>
              <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." type="url" />
            </div>
          ) : (
            <div>
              <Label className="text-xs mb-1.5 block">Upload File</Label>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.xlsx,.xls,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv" />
              {fileUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border">
                  <FileDown className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs truncate flex-1">{fileName}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setFileUrl(null); setFileName(null); }}>Remove</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? "Uploading..." : "Choose File"}
                </Button>
              )}
              <div className="mt-2">
                <Label className="text-xs mb-1.5 block">Or paste a link</Label>
                <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." type="url" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} id="public-toggle" />
            <Label htmlFor="public-toggle" className="text-xs">Make shareable (public link)</Label>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Resource
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResourceCard({ resource, onDelete }: { resource: AudienceResource; onDelete: (id: string) => void }) {
  const typeLabel = RESOURCE_TYPES.find((t) => t.value === resource.resource_type)?.label || resource.resource_type;
  const link = resource.file_url || resource.external_url;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-4 bg-card border-border hover:border-primary/20 transition-all group">
        <div className="flex items-start gap-3">
          <ResourceTypeIcon type={resource.resource_type} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-sm truncate">{resource.title}</h3>
              {resource.is_public ? (
                <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <Lock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              )}
            </div>
            {resource.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{resource.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{typeLabel}</Badge>
              <span className="text-[10px] text-muted-foreground">{format(new Date(resource.created_at), "MMM d, yyyy")}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {link && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}
            {link && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
                <Link2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(resource.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function AudienceResources() {
  const { data: resources = [], isLoading } = useAudienceResources();
  const deleteResource = useDeleteAudienceResource();
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? resources.filter((r) => r.resource_type === filter)
    : resources;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
              <FileDown className="w-6 h-6 text-primary" />
              Audience Resources
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Everything your audience needs — before, during, and after the presentation.
            </p>
          </div>
          <CreateResourceDialog>
            <Button className="gap-1.5 shrink-0">
              <Plus className="w-4 h-4" /> New Resource
            </Button>
          </CreateResourceDialog>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={!filter ? "default" : "secondary"}
            className="cursor-pointer text-[11px] px-2.5 py-0.5"
            onClick={() => setFilter("")}
          >
            All ({resources.length})
          </Badge>
          {RESOURCE_TYPES.map((t) => {
            const count = resources.filter((r) => r.resource_type === t.value).length;
            if (count === 0) return null;
            return (
              <Badge
                key={t.value}
                variant={filter === t.value ? "default" : "secondary"}
                className="cursor-pointer text-[11px] px-2.5 py-0.5"
                onClick={() => setFilter(filter === t.value ? "" : t.value)}
              >
                {t.label} ({count})
              </Badge>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="md" text="Loading resources…" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-border">
            <FileDown className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <h3 className="font-display font-semibold text-base mb-1">No resources yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Create downloadable or shareable items like PDFs, checklists, worksheets, QR handouts, and replay links for your audience.
            </p>
            <CreateResourceDialog>
              <Button variant="outline" className="gap-1.5">
                <Plus className="w-4 h-4" /> Create Your First Resource
              </Button>
            </CreateResourceDialog>
          </Card>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {filtered.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  onDelete={(id) => {
                    if (confirm("Delete this resource?")) deleteResource.mutate(id);
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
