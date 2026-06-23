import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Video, Star, Loader2, AlertTriangle } from "lucide-react";
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
import type { LearningContent } from "@/hooks/useLearningContent";

const emptyForm = {
  title: "",
  description: "",
  video_url: "",
  thumbnail_url: "",
  duration_seconds: 0,
  category: "tutorial",
  is_featured: false,
  sort_order: 0,
};

export default function AdminLearningContent() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LearningContent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-learning-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as LearningContent[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        video_url: form.video_url,
        thumbnail_url: form.thumbnail_url || null,
        duration_seconds: form.duration_seconds,
        category: form.category,
        is_featured: form.is_featured,
        sort_order: form.sort_order,
      };
      if (editing) {
        const { error } = await supabase
          .from("learning_content")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("learning_content")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-learning-content"] });
      qc.invalidateQueries({ queryKey: ["featured-videos"] });
      qc.invalidateQueries({ queryKey: ["learning-content"] });
      toast.success(editing ? "Video updated" : "Video added");
      closeForm();
    },
    onError: () => toast.error("Failed to save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-learning-content"] });
      qc.invalidateQueries({ queryKey: ["featured-videos"] });
      toast.success("Video deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sort_order: items.length + 1 });
    setFormOpen(true);
  };

  const openEdit = (item: LearningContent) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || "",
      video_url: item.video_url,
      thumbnail_url: item.thumbnail_url || "",
      duration_seconds: item.duration_seconds,
      category: item.category,
      is_featured: item.is_featured,
      sort_order: item.sort_order,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const MAX_FEATURED = 10;
  const featuredCount = items.filter((i) => i.is_featured).length;
  const featuredNearLimit = featuredCount >= 8;
  const featuredAtLimit = featuredCount >= MAX_FEATURED;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Learning Content
          </CardTitle>
          <div className="flex items-center gap-2">
            {featuredNearLimit && (
              <span className={`text-xs flex items-center gap-1 ${featuredAtLimit ? "text-destructive" : "text-amber-500"}`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {featuredAtLimit ? `Featured limit reached (${MAX_FEATURED})` : `${featuredCount}/${MAX_FEATURED} featured`}
              </span>
            )}
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Video
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No learning content yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thumb</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Featured</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.thumbnail_url ? (
                        <img src={item.thumbnail_url} alt="" className="w-16 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                          <Video className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.is_featured && <Star className="w-4 h-4 text-primary mx-auto" fill="currentColor" />}
                    </TableCell>
                    <TableCell className="text-center text-sm">{item.sort_order}</TableCell>
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

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Video" : "Add Video"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Video URL *</Label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
            </div>
            <div>
              <Label>Thumbnail URL</Label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="Auto-generated from YouTube if empty" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutorial">Tutorial</SelectItem>
                    <SelectItem value="tips">Tips</SelectItem>
                    <SelectItem value="spotlight">Spotlight</SelectItem>
                    <SelectItem value="webinar">Webinar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (seconds)</Label>
                <Input type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex flex-col gap-1 pt-6">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_featured}
                    onCheckedChange={(c) => setForm({ ...form, is_featured: c })}
                    disabled={!form.is_featured && featuredAtLimit}
                  />
                  <Label>Featured</Label>
                </div>
                {!form.is_featured && featuredAtLimit && (
                  <p className="text-[10px] text-destructive">Max {MAX_FEATURED} featured videos reached</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title || !form.video_url || save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
