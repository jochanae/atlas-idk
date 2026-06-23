import { useState } from "react";
import { MessageSquarePlus, Send, Bug, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const feedbackTypes = [
  { value: "feedback", label: "Feedback", icon: Lightbulb, color: "text-primary" },
  { value: "bug", label: "Bug Report", icon: Bug, color: "text-destructive" },
] as const;

interface FeedbackWidgetProps {
  /** Render as inline trigger (for mobile menus) instead of floating button */
  inline?: boolean;
  trigger?: React.ReactNode;
}

export default function FeedbackWidget({ inline, trigger }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"feedback" | "bug">("feedback");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType("feedback");
    setSubject("");
    setBody("");
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Please fill in subject and details");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to submit feedback");
        return;
      }
      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        feedback_type: type,
        subject: subject.trim(),
        body: body.trim(),
        page_url: window.location.href,
      });
      if (error) throw error;
      toast.success("Thanks for your feedback!");
      reset();
      setOpen(false);
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const dialogTrigger = trigger || (
    inline ? (
      <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full">
        <MessageSquarePlus className="w-4 h-4 shrink-0" />
        <span>Send Feedback</span>
      </button>
    ) : (
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg hidden sm:flex"
        title="Send feedback"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </Button>
    )
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {dialogTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="flex gap-2">
            {feedbackTypes.map((ft) => (
              <button
                key={ft.value}
                onClick={() => setType(ft.value)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  type === ft.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <ft.icon className="w-4 h-4" />
                {ft.label}
              </button>
            ))}
          </div>

          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={type === "bug" ? "What's broken?" : "What's on your mind?"}
            />
          </div>

          <div>
            <Label>Details</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={type === "bug" ? "Steps to reproduce, what you expected..." : "Tell us more..."}
              rows={4}
              className="resize-none"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Page: {window.location.pathname}
          </p>

          <Button
            onClick={handleSubmit}
            disabled={submitting || !subject.trim() || !body.trim()}
            className="w-full gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Sending..." : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
