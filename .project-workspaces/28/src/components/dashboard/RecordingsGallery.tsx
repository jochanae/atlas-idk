import { useState } from "react";
import { Video, Play, Trash2, Clock, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAllRecordings, useDeleteRecording } from "@/hooks/usePresentationRecordings";
import { format } from "date-fns";
import { toast } from "sonner";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingsGallery() {
  const { data: recordings = [], isLoading } = useAllRecordings();
  const deleteRec = useDeleteRecording();
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  if (isLoading || recordings.length === 0) return null;

  const completed = recordings.filter((r) => r.status === "completed" && r.video_url);

  if (completed.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" /> Recent Recordings
          </h2>
          <span className="text-xs text-muted-foreground">{completed.length} recording{completed.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {completed.slice(0, 8).map((rec, i) => (
            <motion.div
              key={rec.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="bg-card border-border overflow-hidden group cursor-pointer hover:border-primary/30 transition-all">
                <div
                  className="relative w-full aspect-video bg-secondary/60 flex items-center justify-center"
                  onClick={() => rec.video_url && setPlayingUrl(rec.video_url)}
                >
                  {rec.thumbnail_url ? (
                    <img src={rec.thumbnail_url} alt={rec.title} className="w-full h-full object-cover" />
                  ) : (
                    <Video className="w-8 h-8 text-muted-foreground/30" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {rec.duration_seconds > 0 && (
                    <Badge variant="secondary" className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 bg-black/70 text-white border-0">
                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                      {formatDuration(rec.duration_seconds)}
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate text-foreground">{rec.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(rec.created_at), "MMM d, yyyy")}</p>
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {rec.video_url && (
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); window.open(rec.video_url!, "_blank"); }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRec.mutate({ id: rec.id, presentationId: rec.presentation_id || "" });
                        toast.success("Recording deleted");
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <Dialog open={!!playingUrl} onOpenChange={() => setPlayingUrl(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black">
          {playingUrl && (
            <video src={playingUrl} controls autoPlay className="w-full max-h-[80vh]" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
