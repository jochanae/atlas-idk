import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bug, AlertTriangle, Lightbulb, Eye, Trash2, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface FeedbackItem {
  id: string;
  user_id: string;
  feedback_type: string;
  subject: string;
  body: string;
  page_url: string | null;
  error_message: string | null;
  error_stack: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const typeIcons: Record<string, typeof Bug> = {
  bug: Bug,
  error: AlertTriangle,
  feedback: Lightbulb,
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Open", variant: "destructive" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
  dismissed: { label: "Dismissed", variant: "outline" },
};

export default function AdminFeedback() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<FeedbackItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("open");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FeedbackItem[];
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!viewing) return;
      const { error } = await supabase
        .from("feedback")
        .update({ status: newStatus, admin_notes: adminNotes })
        .eq("id", viewing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      toast.success("Feedback updated");
      setViewing(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openDetail = (item: FeedbackItem) => {
    setViewing(item);
    setAdminNotes(item.admin_notes || "");
    setNewStatus(item.status);
  };

  const openCount = items.filter((i) => i.status === "open").length;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Feedback & Reports
          {openCount > 0 && (
            <Badge variant="destructive" className="text-xs ml-2">{openCount} open</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No feedback yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const Icon = typeIcons[item.feedback_type] || MessageSquare;
                  const sc = statusConfig[item.status] || statusConfig.open;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs capitalize">{item.feedback_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm font-medium">
                        {item.subject}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(item)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => remove.mutate(item.id)}
                            disabled={remove.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing && (() => { const Icon = typeIcons[viewing.feedback_type] || MessageSquare; return <Icon className="w-5 h-5" />; })()}
              {viewing?.subject}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 py-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Details</p>
                <p className="text-foreground whitespace-pre-wrap">{viewing.body}</p>
              </div>

              {viewing.page_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Page</p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{viewing.page_url}</p>
                </div>
              )}

              {viewing.error_message && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Error</p>
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                    <p className="text-xs font-mono text-destructive/80 break-all">{viewing.error_message}</p>
                  </div>
                </div>
              )}

              {viewing.error_stack && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stack Trace</p>
                  <div className="bg-card border border-border rounded-lg p-2 max-h-32 overflow-auto">
                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{viewing.error_stack}</pre>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Admin Notes</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes..."
                  className="resize-none text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
