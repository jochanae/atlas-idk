import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLowerThirds } from "@/hooks/useLowerThirds";
import { useApprovedImages } from "@/hooks/useApprovedImages";
import { toast } from "sonner";
import { Subtitles, Image, Plus, Trash2, Eye } from "lucide-react";

/* ---- Empty State ---- */
const EmptyState = ({ icon: Icon, title, desc, onAdd }: { icon: any; title: string; desc: string; onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-primary" />
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-muted-foreground text-sm max-w-sm mb-6">{desc}</p>
    <Button onClick={onAdd}><Plus className="w-4 h-4 mr-2" />Add First</Button>
  </div>
);

export default function VisualAssets() {
  const lowerThirds = useLowerThirds();
  const images = useApprovedImages();

  const [adding, setAdding] = useState<"lower" | "image" | null>(null);
  const [formName, setFormName] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("general");

  const reset = () => { setFormName(""); setFormLabel(""); setFormSubtitle(""); setFormUrl(""); setFormCategory("general"); setAdding(null); };

  const handleAdd = async () => {
    try {
      if (adding === "lower") {
        await lowerThirds.create.mutateAsync({ name: formName || "Untitled", label: formLabel, subtitle: formSubtitle });
      } else if (adding === "image") {
        await images.create.mutateAsync({ name: formName || "Untitled", file_url: formUrl, category: formCategory });
      }
      toast.success("Created");
      reset();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Visual Assets</h1>
          <p className="text-muted-foreground text-sm">Lower thirds, overlays & approved imagery for your presentations</p>
        </div>

        <Tabs defaultValue="lower" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lower" className="gap-1.5">
              <Subtitles className="w-3.5 h-3.5" /> Lower Thirds
              {(lowerThirds.data?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{lowerThirds.data?.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-1.5">
              <Image className="w-3.5 h-3.5" /> Approved Images
              {(images.data?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{images.data?.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Lower Thirds */}
          <TabsContent value="lower" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAdding("lower")}><Plus className="w-4 h-4 mr-1" />New Lower Third</Button>
            </div>
            {(lowerThirds.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Subtitles} title="No lower thirds yet" desc="Create name bars and overlays for broadcast-style presentations." onAdd={() => setAdding("lower")} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {lowerThirds.data?.map((lt: any) => (
                  <Card key={lt.id} className="group overflow-hidden">
                    {/* Preview bar */}
                    <div className="h-16 bg-gradient-to-r from-black/90 to-black/70 flex items-end p-3 relative">
                      <div>
                        <p className="text-white font-semibold text-sm leading-tight">{lt.label || lt.name}</p>
                        {lt.subtitle && <p className="text-white/70 text-xs">{lt.subtitle}</p>}
                      </div>
                    </div>
                    <CardContent className="flex items-center justify-between p-3 gap-3">
                      <p className="text-sm font-medium truncate">{lt.name}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={lt.is_active} onCheckedChange={() => lowerThirds.update.mutate({ id: lt.id, is_active: !lt.is_active })} />
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => { lowerThirds.remove.mutate(lt.id); toast.success("Deleted"); }}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Approved Images */}
          <TabsContent value="images" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAdding("image")}><Plus className="w-4 h-4 mr-1" />Add Image</Button>
            </div>
            {(images.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Image} title="No approved images" desc="Build a curated library of team-approved photos and graphics." onAdd={() => setAdding("image")} />
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {images.data?.map((img: any) => (
                  <Card key={img.id} className="group overflow-hidden">
                    <div className="aspect-square bg-muted relative">
                      <img src={img.file_url} alt={img.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                      <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 bg-background/80 opacity-0 group-hover:opacity-100" onClick={() => { images.remove.mutate(img.id); toast.success("Deleted"); }}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                    <CardContent className="p-2">
                      <p className="text-xs font-medium truncate">{img.name}</p>
                      <Badge variant="outline" className="text-[9px] mt-0.5">{img.category}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Dialog */}
      <Dialog open={!!adding} onOpenChange={(o) => !o && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adding === "lower" ? "New Lower Third" : "Add Approved Image"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input placeholder={adding === "lower" ? "Speaker intro" : "Brand photo"} value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            {adding === "lower" ? (
              <>
                <div><Label>Display Label</Label><Input placeholder="Jane Smith" value={formLabel} onChange={e => setFormLabel(e.target.value)} /></div>
                <div><Label>Subtitle</Label><Input placeholder="CEO, Acme Corp" value={formSubtitle} onChange={e => setFormSubtitle(e.target.value)} /></div>
              </>
            ) : (
              <>
                <div><Label>Image URL</Label><Input placeholder="https://..." value={formUrl} onChange={e => setFormUrl(e.target.value)} /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="headshots">Headshots</SelectItem>
                      <SelectItem value="products">Products</SelectItem>
                      <SelectItem value="backgrounds">Backgrounds</SelectItem>
                      <SelectItem value="icons">Icons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button className="w-full" onClick={handleAdd} disabled={lowerThirds.create.isPending || images.create.isPending}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
