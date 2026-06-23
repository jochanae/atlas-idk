import { useState } from "react";
import { MessageSquare, Send, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSlideComments, useAddComment, useResolveComment, useDeleteComment } from "@/hooks/useSlideComments";
import { formatDistanceToNow } from "date-fns";

interface SlideCommentsPanelProps {
  slideId: string;
  presentationId: string;
}

export default function SlideCommentsPanel({ slideId, presentationId }: SlideCommentsPanelProps) {
  const { data: comments = [], isLoading } = useSlideComments(slideId);
  const addComment = useAddComment();
  const resolveComment = useResolveComment();
  const deleteComment = useDeleteComment();
  const [body, setBody] = useState("");

  const handleSubmit = () => {
    if (!body.trim()) return;
    addComment.mutate({ slide_id: slideId, presentation_id: presentationId, body: body.trim() });
    setBody("");
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Comments</span>
        {comments.filter(c => !c.resolved).length > 0 && (
          <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
            {comments.filter(c => !c.resolved).length}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments on this slide yet.</p>
      ) : (
        <div className="space-y-2 max-h-[50dvh] overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className={`p-2.5 rounded-lg border text-xs ${c.resolved ? "opacity-50 border-border bg-secondary/30" : "border-border bg-secondary/50"}`}>
              <p className="leading-relaxed">{c.body}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => resolveComment.mutate({ id: c.id, slideId, resolved: !c.resolved })}
                    title={c.resolved ? "Unresolve" : "Resolve"}
                  >
                    <Check className={`w-3 h-3 ${c.resolved ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive"
                    onClick={() => deleteComment.mutate({ id: c.id, slideId })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="text-xs bg-secondary border-border min-h-[60px]"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
      </div>
      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={handleSubmit}
        disabled={!body.trim() || addComment.isPending}
      >
        <Send className="w-3 h-3" /> Post Comment
      </Button>
    </div>
  );
}
