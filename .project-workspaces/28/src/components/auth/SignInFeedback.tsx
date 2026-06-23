import { useState } from "react";
import { HelpCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SignInFeedback = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("notify-signin-feedback", {
        body: { name: name.trim() || "Anonymous", email: email.trim() || null, message: message.trim() },
      });
      if (error) throw error;

      toast.success("Your message has been sent — we'll look into it!");
      setOpen(false);
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      toast.error("Failed to send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-muted-foreground hover:text-primary text-xs flex items-center gap-1 transition-colors">
          <HelpCircle className="w-3.5 h-3.5" />
          Need Help?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a Sign-In Issue</DialogTitle>
          <DialogDescription>
            Having trouble signing in? Let us know and we'll help you out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fb-name" className="text-sm">Name (optional)</Label>
              <Input
                id="fb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="fb-email" className="text-sm">Email (optional)</Label>
              <Input
                id="fb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="fb-message" className="text-sm">What's happening? *</Label>
            <Textarea
              id="fb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue you're experiencing…"
              required
              rows={4}
              className="mt-1.5 resize-none"
            />
          </div>
          <Button type="submit" disabled={submitting || !message.trim()} className="w-full gap-2">
            <Send className="w-4 h-4" />
            {submitting ? "Sending…" : "Send Feedback"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SignInFeedback;
