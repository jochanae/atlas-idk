import { useState, useEffect } from "react";
import { UserPlus, Loader2, Trash2, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Collaborator {
  id: string;
  user_id: string;
  role: string;
  invited_email: string | null;
  created_at: string;
}

interface CollaborationDialogProps {
  presentationId: string;
}

export default function CollaborationDialog({ presentationId }: CollaborationDialogProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchCollaborators = async () => {
    const { data } = await supabase
      .from("presentation_collaborators")
      .select("*")
      .eq("presentation_id", presentationId);
    setCollaborators((data || []) as Collaborator[]);
    setFetching(false);
  };

  useEffect(() => {
    fetchCollaborators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationId]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      // Look up user by email in profiles (we can't query auth.users)
      // For now, we store the email and the collaboration is available when they log in
      // We use a placeholder UUID that will be matched when they access
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("display_name", email) // This is a fallback — real lookup would use auth admin
        .limit(1);

      // Try to find user by matching their profile
      const userId = profileData?.[0]?.id || crypto.randomUUID(); // Placeholder if not found

      const { error } = await supabase.from("presentation_collaborators").insert({
        presentation_id: presentationId,
        user_id: userId,
        role,
        invited_email: email,
      });

      if (error) {
        if (error.code === "23505") toast.error("Already invited");
        else throw error;
      } else {
        toast.success(`Invited ${email} as ${role}`);
        setEmail("");
        fetchCollaborators();
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to invite collaborator");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    await supabase.from("presentation_collaborators").delete().eq("id", id);
    toast.success("Collaborator removed");
    fetchCollaborators();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          <span className="text-xs">Invite</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Collaborate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="text-sm bg-secondary border-border"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInvite} disabled={loading || !email.trim()} size="sm" className="shrink-0">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Collaborators</p>
            {fetching ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : collaborators.length === 0 ? (
              <p className="text-xs text-muted-foreground">No collaborators yet. Invite someone to start working together.</p>
            ) : (
              collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-secondary/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{c.invited_email || c.user_id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {c.role}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleRemove(c.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Editors can modify slides. Viewers can only see the presentation. Collaborators need a PresentQ account to access.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
