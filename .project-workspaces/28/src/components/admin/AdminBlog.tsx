import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExternalLink, Pencil, Plus, Trash2, FileText } from "lucide-react";
import { Link } from "react-router-dom";

interface BlogFormData {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  author_name: string;
  category: string;
  tags: string;
  meta_title: string;
  meta_description: string;
  is_published: boolean;
}

const emptyForm: BlogFormData = {
  title: "", slug: "", excerpt: "", content: "", cover_image_url: "",
  author_name: "PresentQ Team", category: "tips", tags: "",
  meta_title: "", meta_description: "", is_published: false,
};

const AdminBlog = () => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogFormData>(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: BlogFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        title: formData.title,
        slug: formData.slug || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        excerpt: formData.excerpt || null,
        content: formData.content,
        cover_image_url: formData.cover_image_url || null,
        author_name: formData.author_name,
        category: formData.category,
        tags: formData.tags ? formData.tags.split(",").map((t: string) => t.trim()) : [],
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        is_published: formData.is_published,
        published_at: formData.is_published ? new Date().toISOString() : null,
        created_by: user?.id,
      };

      if (editingId) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blog_posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success(editingId ? "Post updated!" : "Post created!");
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("Post deleted");
    },
  });

  const openEdit = (post: any) => {
    setEditingId(post.id);
    setForm({
      title: post.title, slug: post.slug, excerpt: post.excerpt || "",
      content: post.content, cover_image_url: post.cover_image_url || "",
      author_name: post.author_name, category: post.category,
      tags: (post.tags || []).join(", "), meta_title: post.meta_title || "",
      meta_description: post.meta_description || "", is_published: post.is_published,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Blog Posts
          </h2>
          <p className="text-sm text-muted-foreground">Manage your articles and announcements</p>
        </div>
        <div className="flex gap-2">
          <Link to="/blog" target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" /> View Blog
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> New Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Post" : "New Post"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
                <div>
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div>
                  <Label>Slug (auto-generated if empty)</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="my-blog-post" />
                </div>
                <div>
                  <Label>Excerpt</Label>
                  <Textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} placeholder="Brief summary for listing page..." />
                </div>
                <div>
                  <Label>Content (Markdown) *</Label>
                  <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={12} required placeholder="Write your post in Markdown..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="tips" />
                  </div>
                  <div>
                    <Label>Tags (comma-separated)</Label>
                    <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="presentations, ai, tips" />
                  </div>
                </div>
                <div>
                  <Label>Cover Image URL</Label>
                  <Input value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label>Author Name</Label>
                  <Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>SEO Title</Label>
                    <Input value={form.meta_title} onChange={(e) => setForm({ ...form, meta_title: e.target.value })} placeholder="Override page title..." />
                  </div>
                  <div>
                    <Label>SEO Description</Label>
                    <Input value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} placeholder="Override meta description..." />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                  <Label>Published</Label>
                </div>
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : editingId ? "Update Post" : "Create Post"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading posts...</p>
      ) : posts && posts.length > 0 ? (
        <div className="grid gap-4">
          {posts.map((post: any) => (
            <Card key={post.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${post.is_published ? "bg-green-500" : "bg-yellow-500"}`} />
                    <h3 className="font-medium truncate">{post.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    /{post.slug} · {post.category} · {format(new Date(post.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(post)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this post?")) deleteMutation.mutate(post.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
          <p>No blog posts yet. Click "New Post" to get started.</p>
        </div>
      )}
    </div>
  );
};

export default AdminBlog;
