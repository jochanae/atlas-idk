import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { KnowledgeEntry } from "@/hooks/useKnowledgeBase";

const emptyForm = {
  title: "",
  body: "",
  category: "glossary",
  tags: "",
  is_published: true,
  sort_order: 0,
};

export default function AdminKnowledgeBase() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-knowledge-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as KnowledgeEntry[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        body: form.body,
        category: form.category,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        is_published: form.is_published,
        sort_order: form.sort_order,
      };
      if (editing) {
        const { error } = await supabase.from("knowledge_base").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("knowledge_base").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-knowledge-base"] });
      qc.invalidateQueries({ queryKey: ["knowledge-base"] });
      toast.success(editing ? "Entry updated" : "Entry added");
      closeForm();
    },
    onError: () => toast.error("Failed to save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_base").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-knowledge-base"] });
      qc.invalidateQueries({ queryKey: ["knowledge-base"] });
      toast.success("Entry deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sort_order: items.length + 1 });
    setFormOpen(true);
  };

  const openEdit = (item: KnowledgeEntry) => {
    setEditing(item);
    setForm({
      title: item.title,
      body: item.body,
      category: item.category,
      tags: item.tags?.join(", ") || "",
      is_published: item.is_published ?? true,
      sort_order: item.sort_order ?? 0,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const categoryLabels: Record<string, string> = {
    glossary: "Glossary",
    "how-to": "How-To",
    "pro-tip": "Pro Tip",
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Knowledge Base
          </CardTitle>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Entry
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-center">Published</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {categoryLabels[item.category] || item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                        ))}
                        {(item.tags?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{(item.tags?.length ?? 0) - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.is_published ? "default" : "secondary"} className="text-[10px]">
                        {item.is_published ? "Yes" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entry" : "Add Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Body *</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glossary">Glossary</SelectItem>
                    <SelectItem value="how-to">How-To</SelectItem>
                    <SelectItem value="pro-tip">Pro Tip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="delivery, engagement, tips" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_published} onCheckedChange={(c) => setForm({ ...form, is_published: c })} />
              <Label>Published</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title || !form.body || save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
