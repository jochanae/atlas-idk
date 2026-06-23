import { useState, useRef, useCallback, useEffect } from "react";
import {
  FolderOpen, Upload, FileText, FileSpreadsheet, FileImage, File as FileIcon,
  Eye, ExternalLink, Import, X, Loader2, ChevronRight, Clock, Trash2, Search,
  Save, Sparkles, Highlighter, MessageSquare, GripVertical, Cloud,
  BookOpen, Lightbulb, LayoutTemplate,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ImportPresentationDialog from "@/components/ImportPresentationDialog";
import { useFileLibrary, useUploadToLibrary, useDeleteFromLibrary, useUpdateLibraryFile, type LibraryFile, type Annotation } from "@/hooks/useFileLibrary";
import { supabase } from "@/integrations/supabase/client";

/* ─── helpers ─── */
const EXT_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, pptx: FileSpreadsheet, ppt: FileSpreadsheet,
  docx: FileText, doc: FileText, txt: FileText, md: FileText,
  png: FileImage, jpg: FileImage, jpeg: FileImage, webp: FileImage,
};

function getFileIcon(name: string) {
  const e = name.split(".").pop()?.toLowerCase() || "";
  return EXT_ICONS[e] || FileIcon;
}

const IMPORTABLE = new Set(["pdf", "pptx", "ppt", "txt", "md"]);
const PREVIEWABLE_TEXT = new Set(["txt", "md", "csv", "json", "xml"]);
const PREVIEWABLE_IMAGE = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

interface PickedFile {
  file: File;
  preview?: string;
  imageUrl?: string;
}

/* ─── Recent Files (localStorage) ─── */
const RECENT_KEY = "presentq-recent-files";
const MAX_RECENT = 10;

interface RecentEntry {
  name: string;
  size: number;
  type: string;
  action: "preview" | "open" | "import";
  timestamp: number;
}

function getRecent(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

function addRecent(entry: Omit<RecentEntry, "timestamp">) {
  const list = getRecent().filter((r) => !(r.name === entry.name && r.size === entry.size));
  list.unshift({ ...entry, timestamp: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

function clearRecent() { localStorage.removeItem(RECENT_KEY); }

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Annotation Sub-component ─── */
function AnnotationTools({
  annotations,
  onAddAnnotation,
  selectedText,
}: {
  annotations: Annotation[];
  onAddAnnotation: (type: "highlight" | "comment", color?: string, comment?: string) => void;
  selectedText: string;
}) {
  const [commentText, setCommentText] = useState("");
  const colors = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];

  return (
    <div className="border-t border-border p-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Highlight:</span>
        {colors.map((c) => (
          <button
            key={c}
            className="w-5 h-5 rounded-full border border-border hover:scale-110 transition-transform disabled:opacity-30"
            style={{ backgroundColor: c }}
            disabled={!selectedText}
            onClick={() => onAddAnnotation("highlight", c)}
            title={`Highlight in this color`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder={selectedText ? "Add a comment…" : "Select text first…"}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          disabled={!selectedText}
          className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background disabled:opacity-40"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={!selectedText || !commentText}
          onClick={() => { onAddAnnotation("comment", undefined, commentText); setCommentText(""); }}
        >
          <MessageSquare className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      {annotations.length > 0 && (
        <div className="space-y-1 max-h-24 overflow-y-auto">
          {annotations.map((a) => (
            <div key={a.id} className="flex items-start gap-1.5 text-[10px]">
              {a.type === "highlight" ? (
                <Highlighter className="w-3 h-3 mt-0.5 shrink-0" style={{ color: a.color }} />
              ) : (
                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
              )}
              <span className="text-muted-foreground truncate">
                "{a.text.slice(0, 40)}{a.text.length > 40 ? "…" : ""}"
                {a.comment && <span className="text-foreground ml-1">— {a.comment}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── AI Analysis Panel ─── */
function AIAnalysisPanel({ file }: { file: LibraryFile }) {
  return (
    <div className="space-y-3 p-3">
      {file.ai_summary && (
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1">
            <BookOpen className="w-3 h-3 text-primary" /> Summary
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{file.ai_summary}</p>
        </div>
      )}
      {file.ai_key_points?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1">
            <Lightbulb className="w-3 h-3 text-primary" /> Key Points
          </h4>
          <ul className="space-y-1">
            {file.ai_key_points.map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary font-bold mt-px">•</span> {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      {file.ai_suggested_slides?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1">
            <LayoutTemplate className="w-3 h-3 text-primary" /> Suggested Slides
          </h4>
          <div className="space-y-1.5">
            {file.ai_suggested_slides.map((s, i) => (
              <div key={i} className="bg-secondary/50 rounded-lg p-2">
                <p className="text-xs font-medium">{s.title}</p>
                <p className="text-[10px] text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {!file.ai_summary && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No analysis yet. Click "Analyze" to get AI insights.
        </p>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function FileHubDialog({ children, open: controlledOpen, onOpenChange }: { children?: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [activePreview, setActivePreview] = useState<PickedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentEntry[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [activeTab, setActiveTab] = useState("local");
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [activeLibFile, setActiveLibFile] = useState<LibraryFile | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  // Library hooks
  const { data: libraryFiles = [], isLoading: libLoading } = useFileLibrary();
  const uploadToLib = useUploadToLibrary();
  const deleteFromLib = useDeleteFromLibrary();
  const updateLibFile = useUpdateLibraryFile();

  useEffect(() => {
    if (open) setRecentFiles(getRecent());
  }, [open]);

  const trackRecent = useCallback((file: File, action: "preview" | "open" | "import") => {
    addRecent({ name: file.name, size: file.size, type: file.type, action });
    setRecentFiles(getRecent());
  }, []);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    setLoading(true);
    const arr = Array.from(fileList);
    const entries: PickedFile[] = [];
    for (const f of arr) {
      if (f.size > 50 * 1024 * 1024) continue;
      const e = ext(f.name);
      let preview: string | undefined;
      let imageUrl: string | undefined;
      if (PREVIEWABLE_TEXT.has(e)) {
        try {
          preview = await f.text();
          if (preview.length > 20000) preview = preview.slice(0, 20000) + "\n\n…(truncated)";
        } catch { /* ignore */ }
      }
      if (PREVIEWABLE_IMAGE.has(e)) {
        imageUrl = URL.createObjectURL(f);
      }
      entries.push({ file: f, preview, imageUrl });
    }
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => `${p.file.name}|${p.file.size}`));
      return [...prev, ...entries.filter((e) => !existing.has(`${e.file.name}|${e.file.size}`))];
    });
    setLoading(false);
  }, []);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => {
    const pf = files[idx];
    if (pf.imageUrl) URL.revokeObjectURL(pf.imageUrl);
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    if (activePreview && files[idx] === activePreview) setActivePreview(null);
  };

  const openNatively = (f: File) => {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackRecent(f, "open");
  };

  const handlePreview = (pf: PickedFile) => {
    setActivePreview(activePreview === pf ? null : pf);
    trackRecent(pf.file, "preview");
  };

  const handleImport = (pf: PickedFile) => {
    trackRecent(pf.file, "import");
    setImportFile(pf.file);
    setOpen(false);
  };

  const canImport = (name: string) => IMPORTABLE.has(ext(name));
  const canPreview = (pf: PickedFile) => !!pf.preview || !!pf.imageUrl;

  // Save to cloud library
  const saveToLibrary = async (pf: PickedFile) => {
    setSavingFile(true);
    try {
      await uploadToLib.mutateAsync({ file: pf.file });
      toast.success(`"${pf.file.name}" saved to your library`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSavingFile(false);
  };

  // AI analysis
  const analyzeDocument = async (text: string, fileName: string, fileId: string) => {
    setAnalyzing(fileId);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-document", {
        body: { text, fileName },
      });
      if (error) throw error;
      await updateLibFile.mutateAsync({
        id: fileId,
        updates: {
          ai_summary: data.summary,
          ai_key_points: data.key_points,
          ai_suggested_slides: data.suggested_slides,
        },
      });
      toast.success("Analysis complete!");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    }
    setAnalyzing(null);
  };

  // Text selection for annotations
  const handleTextSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim() && previewRef.current?.contains(selection.anchorNode)) {
      setSelectedText(selection.toString().trim());
      const range = selection.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(previewRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const start = preRange.toString().length;
      setSelectionRange({ start, end: start + selection.toString().length });
    }
  };

  const addAnnotation = (type: "highlight" | "comment", color?: string, comment?: string) => {
    if (!selectedText || !selectionRange || !activeLibFile) return;
    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      type,
      color: color || "#fef08a",
      text: selectedText,
      startOffset: selectionRange.start,
      endOffset: selectionRange.end,
      comment,
      createdAt: new Date().toISOString(),
    };
    const updated = [...(activeLibFile.annotations || []), newAnnotation];
    updateLibFile.mutate({ id: activeLibFile.id, updates: { annotations: updated as any } });
    setActiveLibFile({ ...activeLibFile, annotations: updated });
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
    toast.success(type === "highlight" ? "Highlighted!" : "Comment added!");
  };

  // Drag-to-slide support
  const handleDragStart = (e: React.DragEvent, content: string, type: string = "text") => {
    e.dataTransfer.setData("text/plain", content);
    e.dataTransfer.setData("application/x-presentq-type", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleClearRecent = () => { clearRecent(); setRecentFiles([]); };
  const actionLabel: Record<string, string> = { preview: "Previewed", open: "Opened", import: "Imported" };

  const filteredFiles = files.filter((pf) =>
    !fileSearch || pf.file.name.toLowerCase().includes(fileSearch.toLowerCase()) || ext(pf.file.name).includes(fileSearch.toLowerCase())
  );

  const filteredLibrary = libraryFiles.filter((f) =>
    !fileSearch || f.file_name.toLowerCase().includes(fileSearch.toLowerCase()) || f.file_type.toLowerCase().includes(fileSearch.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setActivePreview(null); setActiveLibFile(null); } }}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              File Hub
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden mt-1">
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="local" className="text-xs gap-1.5">
                <Upload className="w-3 h-3" /> Local Files
              </TabsTrigger>
              <TabsTrigger value="library" className="text-xs gap-1.5">
                <Cloud className="w-3 h-3" /> My Library
              </TabsTrigger>
            </TabsList>

            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search files by name or type..."
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {fileSearch && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setFileSearch("")}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* ── LOCAL TAB ── */}
            <TabsContent value="local" className="flex-1 flex flex-col gap-3 overflow-hidden mt-2">
              {/* Drop zone */}
              <button
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="w-full p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/40 transition-colors flex flex-col items-center gap-1.5"
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm font-medium">Drop files or click to browse</p>
                <p className="text-xs text-muted-foreground">Word, PowerPoint, PDF, TXT, images & more</p>
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handlePick} multiple accept="*/*" />

              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading files…
                </div>
              )}

              {/* File list + preview */}
              {filteredFiles.length > 0 && (
                <div className="flex-1 flex gap-3 overflow-hidden min-h-0">
                  <ScrollArea className={`${activePreview ? "w-1/2" : "w-full"} border border-border rounded-xl`}>
                    <div className="p-2 space-y-1">
                      {filteredFiles.map((pf, i) => {
                        const Icon = getFileIcon(pf.file.name);
                        const isActive = activePreview === pf;
                        return (
                          <div
                            key={`${pf.file.name}-${i}`}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                              isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary/80 border border-transparent"
                            }`}
                            onClick={() => canPreview(pf) && handlePreview(pf)}
                            draggable={!!pf.preview}
                            onDragStart={(e) => pf.preview && handleDragStart(e, pf.preview)}
                          >
                            <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-xs">{pf.file.name}</p>
                              <p className="text-[10px] text-muted-foreground">{(pf.file.size / 1024).toFixed(0)} KB · {ext(pf.file.name).toUpperCase()}</p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {canPreview(pf) && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Preview" onClick={(e) => { e.stopPropagation(); handlePreview(pf); }}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Save to Library" onClick={(e) => { e.stopPropagation(); saveToLibrary(pf); }}>
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Open natively" onClick={(e) => { e.stopPropagation(); openNatively(pf.file); }}>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                              {canImport(pf.file.name) && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="Import as presentation" onClick={(e) => { e.stopPropagation(); handleImport(pf); }}>
                                  <Import className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                                <X className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {/* Preview pane */}
                  {activePreview && (
                    <div className="w-1/2 border border-border rounded-xl overflow-hidden flex flex-col">
                      <div className="px-3 py-2 border-b border-border bg-secondary/30 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium truncate">{activePreview.file.name}</span>
                      </div>
                      <ScrollArea className="flex-1 p-3">
                        {activePreview.imageUrl ? (
                          <img
                            src={activePreview.imageUrl}
                            alt={activePreview.file.name}
                            className="w-full h-auto rounded-lg object-contain max-h-[50vh]"
                            draggable
                            onDragStart={(e) => handleDragStart(e, activePreview.imageUrl!, "image")}
                          />
                        ) : (
                          <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                            {activePreview.preview}
                          </pre>
                        )}
                      </ScrollArea>
                      <div className="px-3 py-2 border-t border-border flex items-center gap-2">
                        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => openNatively(activePreview.file)}>
                          <ExternalLink className="w-3 h-3" /> Open
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => saveToLibrary(activePreview)} disabled={savingFile}>
                          {savingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                        </Button>
                        {canImport(activePreview.file.name) && (
                          <Button size="sm" className="text-xs gap-1.5 bg-gradient-gold text-primary-foreground" onClick={() => handleImport(activePreview)}>
                            <Import className="w-3 h-3" /> Import
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recent */}
              {files.length === 0 && !loading && recentFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Recent Files</h3>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 text-muted-foreground hover:text-destructive gap-1" onClick={handleClearRecent}>
                      <Trash2 className="w-2.5 h-2.5" /> Clear
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {recentFiles.map((r, i) => {
                      const Icon = getFileIcon(r.name);
                      return (
                        <div key={`${r.name}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent hover:bg-secondary/80 transition-colors">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium text-xs">{r.name}</p>
                            <p className="text-[10px] text-muted-foreground">{(r.size / 1024).toFixed(0)} KB · {actionLabel[r.action]} · {timeAgo(r.timestamp)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty */}
              {files.length === 0 && !loading && recentFiles.length === 0 && (
                <div className="py-6 text-center text-muted-foreground">
                  <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Drop files here to preview, save, or import</p>
                  <p className="text-xs mt-1">Drag content from previews directly into your slides</p>
                </div>
              )}

              {files.length > 0 && (
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Preview</span>
                  <span className="flex items-center gap-1"><Save className="w-3 h-3" /> Save to Library</span>
                  <span className="flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag to slide</span>
                  <span className="flex items-center gap-1"><Import className="w-3 h-3" /> Import as deck</span>
                </div>
              )}
            </TabsContent>

            {/* ── LIBRARY TAB ── */}
            <TabsContent value="library" className="flex-1 flex flex-col gap-3 overflow-hidden mt-2">
              {libLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
                </div>
              )}

              {!libLoading && filteredLibrary.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  <Cloud className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Your cloud library is empty</p>
                  <p className="text-xs mt-1">Save files from the Local tab to build your library</p>
                </div>
              )}

              {filteredLibrary.length > 0 && (
                <div className="flex-1 flex gap-3 overflow-hidden min-h-0">
                  <ScrollArea className={`${activeLibFile ? "w-1/2" : "w-full"} border border-border rounded-xl`}>
                    <div className="p-2 space-y-1">
                      {filteredLibrary.map((lf) => {
                        const Icon = getFileIcon(lf.file_name);
                        const isActive = activeLibFile?.id === lf.id;
                        const isImage = PREVIEWABLE_IMAGE.has(ext(lf.file_name));
                        return (
                          <div
                            key={lf.id}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                              isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary/80 border border-transparent"
                            }`}
                            onClick={() => setActiveLibFile(isActive ? null : lf)}
                            draggable
                            onDragStart={(e) => handleDragStart(e, lf.publicUrl, isImage ? "image" : "text")}
                          >
                            <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-xs">{lf.file_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-[10px] text-muted-foreground">{(lf.file_size / 1024).toFixed(0)} KB</p>
                                {lf.ai_summary && <Badge variant="secondary" className="text-[8px] h-3.5 px-1"><Sparkles className="w-2 h-2 mr-0.5" /> Analyzed</Badge>}
                                {lf.annotations?.length > 0 && <Badge variant="outline" className="text-[8px] h-3.5 px-1">{lf.annotations.length} notes</Badge>}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" title="Delete" onClick={(e) => {
                                e.stopPropagation();
                                deleteFromLib.mutate({ id: lf.id, filePath: lf.file_path });
                                if (activeLibFile?.id === lf.id) setActiveLibFile(null);
                              }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {/* Library preview + analysis + annotations */}
                  {activeLibFile && (
                    <div className="w-1/2 border border-border rounded-xl overflow-hidden flex flex-col">
                      <div className="px-3 py-2 border-b border-border bg-secondary/30 flex items-center justify-between">
                        <span className="text-xs font-medium truncate flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          {activeLibFile.file_name}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs gap-1"
                          disabled={analyzing === activeLibFile.id || !PREVIEWABLE_TEXT.has(ext(activeLibFile.file_name))}
                          onClick={async () => {
                            try {
                              const resp = await fetch(activeLibFile.publicUrl);
                              const text = await resp.text();
                              analyzeDocument(text, activeLibFile.file_name, activeLibFile.id);
                            } catch { toast.error("Could not read file for analysis"); }
                          }}
                        >
                          {analyzing === activeLibFile.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          {activeLibFile.ai_summary ? "Re-analyze" : "Analyze"}
                        </Button>
                      </div>

                      <ScrollArea className="flex-1" onMouseUp={handleTextSelect}>
                        {PREVIEWABLE_IMAGE.has(ext(activeLibFile.file_name)) ? (
                          <div className="p-3">
                            <img src={activeLibFile.publicUrl} alt={activeLibFile.file_name} className="w-full h-auto rounded-lg object-contain max-h-[40vh]" />
                          </div>
                        ) : activeLibFile.ai_summary ? (
                          <AIAnalysisPanel file={activeLibFile} />
                        ) : (
                          <div className="p-3">
                            <pre ref={previewRef} className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed select-text">
                              Loading preview…
                            </pre>
                          </div>
                        )}
                      </ScrollArea>

                      {/* Annotations */}
                      {PREVIEWABLE_TEXT.has(ext(activeLibFile.file_name)) && (
                        <AnnotationTools
                          annotations={activeLibFile.annotations || []}
                          onAddAnnotation={addAnnotation}
                          selectedText={selectedText}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cloud storage coming soon */}
              <div className="border border-dashed border-border rounded-xl p-3 flex items-center gap-3">
                <Cloud className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Google Drive, Dropbox & OneDrive</p>
                  <p className="text-[10px] text-muted-foreground">Cloud storage integration coming soon</p>
                </div>
                <Badge variant="secondary" className="text-[9px]">Soon</Badge>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {importFile && <ImportFileForwarder file={importFile} onDone={() => setImportFile(null)} />}
    </>
  );
}

function ImportFileForwarder({ file, onDone }: { file: File; onDone: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <ImportPresentationDialog>
      <Button ref={triggerRef} className="hidden" onClick={() => {}} />
    </ImportPresentationDialog>
  );
}
