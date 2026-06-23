import { useState, useRef } from "react";
import { FileDown, Plus, Trash2, ExternalLink, Upload, Loader2, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  useAudienceResources,
  useCreateAudienceResource,
  uploadResourceFile,
  RESOURCE_TYPES,
  type AudienceResource,
} from "@/hooks/useAudienceResources";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { Slide } from "@/hooks/useSlides";

interface SlideResourcesPanelProps {
  slide: Slide;
  presentationId: string;
  onUpdate: (content: Json, notes?: string) => void;
}

export default function SlideResourcesPanel({ slide, presentationId, onUpdate }: SlideResourcesPanelProps) {
  const { data: allResources = [] } = useAudienceResources();
  const presResources = allResources.filter((r) => r.presentation_id === presentationId || !r.presentation_id);
  const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
    ? (slide.content as Record<string, unknown>)
    : {};
  const attachedIds = (content.resource_ids as string[]) || [];
  const attached = allResources.filter((r) => attachedIds.includes(r.id));

  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleResource = (resourceId: string) => {
    const current = [...attachedIds];
    const idx = current.indexOf(resourceId);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(resourceId);
    onUpdate({ ...content, resource_ids: current } as Json, slide.notes ?? undefined);
  };

  const detach = (resourceId: string) => {
    const updated = attachedIds.filter((id) => id !== resourceId);
    onUpdate({ ...content, resource_ids: updated } as Json, slide.notes ?? undefined);
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <FileDown className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Slide Resources</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Attach downloadable resources to this slide for your audience.</p>

      {/* Attached resources */}
      {attached.length > 0 ? (
        <div className="space-y-1.5">
          {attached.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border">
              <FileDown className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{r.title}</p>
                <p className="text-[10px] text-muted-foreground">{RESOURCE_TYPES.find((t) => t.value === r.resource_type)?.label}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => detach(r.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-muted-foreground">No resources attached to this slide</div>
      )}

      {/* Attach existing or create new */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Attach Resource
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileDown className="w-4 h-4 text-primary" /> Attach Resource
            </DialogTitle>
          </DialogHeader>
          <ResourcePickerContent
            resources={presResources}
            attachedIds={attachedIds}
            onToggle={toggleResource}
            presentationId={presentationId}
            onClose={() => setPickerOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResourcePickerContent({
  resources,
  attachedIds,
  onToggle,
  presentationId,
  onClose,
}: {
  resources: AudienceResource[];
  attachedIds: string[];
  onToggle: (id: string) => void;
  presentationId: string;
  onClose: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [resourceType, setResourceType] = useState("pdf");
  const [externalUrl, setExternalUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateAudienceResource();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadResourceFile(file);
      setFileUrl(url);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    const result = await create.mutateAsync({
      title: title.trim(),
      resource_type: resourceType,
      presentation_id: presentationId,
      file_url: fileUrl || undefined,
      external_url: externalUrl.trim() || undefined,
    });
    onToggle(result.id);
    setShowCreate(false);
    setTitle("");
    setFileUrl(null);
    setExternalUrl("");
  };

  if (showCreate) {
    return (
      <div className="space-y-3">
        <Select value={resourceType} onValueChange={setResourceType}>
          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" className="text-sm" />
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
        {fileUrl ? (
          <Badge variant="secondary" className="text-xs gap-1"><FileDown className="w-3 h-3" /> File uploaded</Badge>
        ) : (
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? "Uploading..." : "Upload File"}
          </Button>
        )}
        <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="Or paste a URL" className="text-sm" />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" className="flex-1 gap-1" onClick={handleCreate} disabled={create.isPending || !title.trim()}>
            {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Create & Attach
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 flex-1 overflow-y-auto">
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowCreate(true)}>
        <Plus className="w-3.5 h-3.5" /> Create New Resource
      </Button>
      {resources.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No resources yet. Create one above.</p>
      ) : (
        <div className="space-y-1">
          {resources.map((r) => {
            const isAttached = attachedIds.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => onToggle(r.id)}
                className={`w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-sm ${
                  isAttached ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <FileDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">{RESOURCE_TYPES.find((t) => t.value === r.resource_type)?.label}</p>
                </div>
                {isAttached && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
