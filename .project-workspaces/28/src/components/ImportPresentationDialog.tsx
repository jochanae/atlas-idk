import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Sparkles, Loader2, AlertCircle, Import, X, CheckCircle2, Files } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ImportMode = "faithful" | "ai";

interface FileEntry {
  file: File;
  status: "pending" | "importing" | "done" | "error";
  error?: string;
  resultId?: string;
}

export default function ImportPresentationDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [mode, setMode] = useState<ImportMode>("faithful");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dropRef = useRef<HTMLButtonElement>(null);

  const accept = ".pdf,.pptx,.ppt,.txt,.md";

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: FileEntry[] = [];
    const arr = Array.from(fileList);
    for (const f of arr) {
      if (f.size > 20 * 1024 * 1024) {
        setError(`${f.name} exceeds 20MB limit`);
        continue;
      }
      // Avoid duplicates
      if (files.some((e) => e.file.name === f.name && e.file.size === f.size)) continue;
      newFiles.push({ file: f, status: "pending" });
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      setError("");
    }
  }, [files]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isBulk = files.length > 1;

  const importSingle = async (entry: FileEntry, index: number): Promise<string | null> => {
    setFiles((prev) => prev.map((e, i) => i === index ? { ...e, status: "importing" } : e));

    try {
      const formData = new FormData();
      formData.append("file", entry.file);
      formData.append("mode", mode);
      formData.append("title", entry.file.name.replace(/\.(pdf|pptx?|txt|md)$/i, ""));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please log in first");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-presentation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");

      setFiles((prev) => prev.map((e, i) => i === index ? { ...e, status: "done", resultId: result.id } : e));
      return result.id;
    } catch (err: any) {
      setFiles((prev) => prev.map((e, i) => i === index ? { ...e, status: "error", error: err.message } : e));
      return null;
    }
  };

  const handleImport = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError("");

    let lastId: string | null = null;

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "done") continue;
      const id = await importSingle(files[i], i);
      if (id) lastId = id;
    }

    qc.invalidateQueries({ queryKey: ["presentations"] });
    setIsUploading(false);

    const doneCount = files.filter((f) => f.status === "done").length + (lastId ? 1 : 0);

    if (doneCount === files.length) {
      toast.success(`${doneCount} deck${doneCount > 1 ? "s" : ""} imported!`);
      setOpen(false);
      setFiles([]);
      if (lastId && files.length === 1) navigate(`/editor/${lastId}`);
    } else if (doneCount > 0) {
      toast.success(`${doneCount} of ${files.length} imported. Check errors below.`);
    }
  };

  const completedCount = files.filter((f) => f.status === "done").length;
  const progressPct = files.length > 0 ? (completedCount / files.length) * 100 : 0;
  const hasPptx = files.some((f) => f.file.name.toLowerCase().endsWith(".pptx"));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFiles([]); setError(""); setMode("faithful"); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            {isBulk && <Files className="w-5 h-5 text-primary" />}
            Import {isBulk ? `${files.length} Presentations` : "Presentation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* File drop zone */}
          <button
            ref={dropRef}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="w-full p-6 border-2 border-dashed border-border rounded-xl hover:border-primary/40 transition-colors flex flex-col items-center gap-2"
          >
            <Upload className="w-7 h-7 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Drop files or click to browse</p>
              <p className="text-xs text-muted-foreground">PDF, PPTX, TXT, MD — max 20MB each • Select multiple</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFile} multiple />

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((entry, i) => (
                <div key={`${entry.file.name}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm">
                  {entry.status === "pending" && <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {entry.status === "importing" && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
                  {entry.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  {entry.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  <span className="truncate flex-1 text-xs">{entry.file.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{(entry.file.size / 1024).toFixed(0)}KB</span>
                  {entry.status === "pending" && !isUploading && (
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="shrink-0">
                      <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bulk progress */}
          {isUploading && isBulk && (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-center">{completedCount} of {files.length} imported</p>
            </div>
          )}

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("faithful")}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                mode === "faithful" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <Import className="w-4 h-4 text-primary mb-1" />
              <p className="text-sm font-medium">Original Import</p>
              <p className="text-xs text-muted-foreground">
                {hasPptx ? "Keeps every slide, colors & images" : "Preserves original structure"}
              </p>
            </button>
            <button
              onClick={() => setMode("ai")}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                mode === "ai" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <Sparkles className="w-4 h-4 text-primary mb-1" />
              <p className="text-sm font-medium">AI Reimagine</p>
              <p className="text-xs text-muted-foreground">AI restructures into a new deck</p>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            className="w-full bg-gradient-gold text-primary-foreground"
            onClick={handleImport}
            disabled={files.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isBulk ? `Importing ${files.length} decks...` : (mode === "ai" ? "AI is reimagining..." : "Importing slides...")}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {isBulk ? `Import ${files.length} Decks` : (mode === "ai" ? "Reimagine with AI" : "Import Deck")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
