import { useState, useRef } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { motion } from "framer-motion";
import { Plus, Trash2, Loader2, Palette, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useBrandKits, useCreateBrandKit, useUpdateBrandKit, useDeleteBrandKit, BrandKit } from "@/hooks/useBrandKits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LogoGenerator from "@/components/brand/LogoGenerator";

const FONT_OPTIONS = [
  "Inter", "DM Sans", "Playfair Display", "Space Grotesk", "Libre Baskerville",
  "Montserrat", "Raleway", "Poppins", "Roboto", "Lato", "Merriweather",
];

function BrandKitCard({ kit, onUpdate, onDelete }: { kit: BrandKit; onUpdate: (id: string, updates: Partial<BrandKit>) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(kit.name);
  const [primaryColor, setPrimaryColor] = useState(kit.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(kit.secondary_color);
  const [accentColor, setAccentColor] = useState(kit.accent_color);
  const [headingFont, setHeadingFont] = useState(kit.heading_font);
  const [bodyFont, setBodyFont] = useState(kit.body_font);
  const [logoUrl, setLogoUrl] = useState(kit.logo_url || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const path = `${user.id}/brand-logo-${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("slide-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("slide-assets").getPublicUrl(path);
      setLogoUrl(publicUrl);
      onUpdate(kit.id, { logo_url: publicUrl });
      toast.success("Logo uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    onUpdate(kit.id, {
      name,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      accent_color: accentColor,
      heading_font: headingFont,
      body_font: bodyFont,
      logo_url: logoUrl || null,
    });
    toast.success("Brand kit saved");
  };

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-display font-semibold text-sm bg-transparent border-none p-0 h-auto focus-visible:ring-0 w-48"
        />
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
            <Save className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(kit.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Logo */}
      <div className="mb-4">
        <label className="text-xs text-muted-foreground mb-1 block">Logo</label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Brand logo" className="h-10 w-auto rounded border border-border object-contain" />
          ) : (
            <div className="h-10 w-16 rounded border border-dashed border-border flex items-center justify-center">
              <Palette className="w-4 h-4 text-muted-foreground/40" />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
            Upload
          </Button>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Primary", value: primaryColor, set: setPrimaryColor },
          { label: "Secondary", value: secondaryColor, set: setSecondaryColor },
          { label: "Accent", value: accentColor, set: setAccentColor },
        ].map((c) => (
          <div key={c.label}>
            <label className="text-xs text-muted-foreground mb-1 block">{c.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={c.value}
                onChange={(e) => c.set(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
              <Input
                value={c.value}
                onChange={(e) => c.set(e.target.value)}
                className="text-xs h-8 font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Heading Font", value: headingFont, set: setHeadingFont },
          { label: "Body Font", value: bodyFont, set: setBodyFont },
        ].map((f) => (
          <div key={f.label}>
            <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
            <Select value={f.value} onValueChange={f.set}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="mt-4 p-4 rounded-lg border border-border" style={{ backgroundColor: secondaryColor }}>
        <div className="flex items-center gap-2 mb-2">
          {logoUrl && <img src={logoUrl} alt="" className="h-5 w-auto" />}
          <span style={{ color: primaryColor, fontFamily: headingFont }} className="font-bold text-sm">Preview Heading</span>
        </div>
        <p style={{ color: accentColor, fontFamily: bodyFont }} className="text-xs">Body text preview with your brand fonts and colors.</p>
      </div>
    </Card>
  );
}

export default function BrandKitPage() {
  const { data: kits = [], isLoading } = useBrandKits();
  const createKit = useCreateBrandKit();
  const updateKit = useUpdateBrandKit();
  const deleteKit = useDeleteBrandKit();

  const handleCreate = () => {
    createKit.mutate({}, {
      onSuccess: () => toast.success("Brand kit created"),
    });
  };

  const handleUpdate = (id: string, updates: Partial<BrandKit>) => {
    updateKit.mutate({ id, ...updates });
  };

  const handleDelete = (id: string) => {
    deleteKit.mutate(id, {
      onSuccess: () => toast.success("Brand kit deleted"),
    });
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold">Brand Kit</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Set your brand colors, fonts, and logo for consistent presentations.
            </p>
          </div>
          <Button onClick={handleCreate} disabled={createKit.isPending} className="bg-gradient-gold text-primary-foreground">
            {createKit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            New Brand Kit
          </Button>
        </div>

        {/* AI Logo Generator */}
        <LogoGenerator
          onSaveToBrandKit={(url) => {
            // If there's a kit, update the first one's logo; otherwise create a new kit with it
            if (kits.length > 0) {
              handleUpdate(kits[0].id, { logo_url: url });
            } else {
              createKit.mutate({ logo_url: url }, { onSuccess: () => toast.success("Brand kit created with logo") });
            }
          }}
        />

        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="md" text="Loading brand kits…" />
          </div>
        ) : kits.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <Palette className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="font-display font-semibold mb-1">No brand kits yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create your first brand kit to keep every presentation on-brand.
            </p>
            <Button onClick={handleCreate} className="mt-4 bg-gradient-gold text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Create Brand Kit
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {kits.map((kit, i) => (
              <motion.div
                key={kit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <BrandKitCard kit={kit} onUpdate={handleUpdate} onDelete={handleDelete} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
