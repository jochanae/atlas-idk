import { useState, useRef } from "react";
import { Palette, Type, Sparkles, Check, Music, Upload, Trash2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SlideTheme, PRESET_THEMES, FONT_PAIRINGS, TRANSITIONS,
  TransitionType,
} from "@/lib/slideThemes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SmartTransitions from "./SmartTransitions";
import type { Slide } from "@/hooks/useSlides";

interface ThemePanelProps {
  theme: SlideTheme;
  transition: TransitionType;
  onThemeChange: (theme: SlideTheme) => void;
  onTransitionChange: (transition: TransitionType) => void;
  slides?: Slide[];
}

export default function ThemePanel({ theme, transition, onThemeChange, onTransitionChange, slides = [] }: ThemePanelProps) {
  const [tab, setTab] = useState<"presets" | "colors" | "fonts" | "transitions" | "music">("presets");
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); return; }
    const filePath = `${user.id}/music-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("slide-assets").upload(filePath, file, { contentType: file.type, upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("slide-assets").getPublicUrl(filePath);
    onThemeChange({ ...theme, backgroundMusicUrl: publicUrl });
    toast.success("Background music uploaded");
  };

  const toggleMusicPreview = () => {
    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setIsPlayingPreview(false);
    } else if (theme.backgroundMusicUrl) {
      const audio = new Audio(theme.backgroundMusicUrl);
      audio.volume = 0.3;
      audio.onended = () => setIsPlayingPreview(false);
      previewAudioRef.current = audio;
      audio.play().catch(() => {});
      setIsPlayingPreview(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
        {([
          { id: "presets" as const, icon: Palette, label: "Themes" },
          { id: "colors" as const, icon: Sparkles, label: "Colors" },
          { id: "fonts" as const, icon: Type, label: "Fonts" },
          { id: "transitions" as const, icon: Sparkles, label: "Motion" },
          { id: "music" as const, icon: Music, label: "Music" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-[10px] font-medium px-2 py-1.5 rounded-md transition-colors ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="h-[280px]">
        {tab === "presets" && (
          <div className="grid grid-cols-2 gap-2">
            {PRESET_THEMES.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onThemeChange(preset)}
                className={`relative rounded-lg border-2 overflow-hidden transition-all ${
                  theme.id === preset.id ? "border-primary" : "border-border hover:border-primary/30"
                }`}
              >
                <div
                  className="aspect-video p-2 flex flex-col items-center justify-center"
                  style={{ background: preset.background }}
                >
                  <div
                    className="text-[10px] font-bold mb-0.5"
                    style={{ color: preset.foreground, fontFamily: `'${preset.headingFont}', sans-serif` }}
                  >
                    Heading
                  </div>
                  <div className="flex gap-1">
                    {[preset.primary, preset.accent, preset.secondary].map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-full" style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <div className="text-[9px] text-muted-foreground text-center py-1 bg-card">
                  {preset.name}
                </div>
                {theme.id === preset.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {tab === "colors" && (
          <div className="space-y-3">
            {([
              { key: "background" as const, label: "Background" },
              { key: "foreground" as const, label: "Text" },
              { key: "primary" as const, label: "Primary" },
              { key: "secondary" as const, label: "Secondary" },
              { key: "accent" as const, label: "Accent" },
              { key: "muted" as const, label: "Muted" },
            ]).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">{label}</label>
                <div className="relative flex-1">
                  <Input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => onThemeChange({ ...theme, id: "custom", name: "Custom", [key]: e.target.value })}
                    className="h-8 w-10 p-0.5 cursor-pointer border-border rounded"
                  />
                </div>
                <Input
                  value={theme[key]}
                  onChange={(e) => onThemeChange({ ...theme, id: "custom", name: "Custom", [key]: e.target.value })}
                  className="h-7 w-20 text-[10px] bg-secondary border-border font-mono"
                />
              </div>
            ))}

            {/* Mode toggle */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <label className="text-xs text-muted-foreground w-20">Mode</label>
              <div className="flex gap-1">
                {(["light", "dark"] as const).map((m) => (
                  <Button
                    key={m}
                    variant={theme.mode === m ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[10px] px-3"
                    onClick={() => onThemeChange({ ...theme, id: "custom", name: "Custom", mode: m })}
                  >
                    {m === "light" ? "☀️" : "🌙"} {m}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "fonts" && (
          <div className="space-y-2">
            {FONT_PAIRINGS.map((pair) => (
              <button
                key={pair.label}
                onClick={() => onThemeChange({ ...theme, headingFont: pair.heading, bodyFont: pair.body })}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  theme.headingFont === pair.heading && theme.bodyFont === pair.body
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="text-xs font-semibold text-foreground mb-0.5" style={{ fontFamily: `'${pair.heading}', sans-serif` }}>
                  {pair.heading}
                </div>
                <div className="text-[10px] text-muted-foreground" style={{ fontFamily: `'${pair.body}', sans-serif` }}>
                  {pair.body} — {pair.label}
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === "transitions" && (
          <div className="space-y-3">
            <SmartTransitions
              slides={slides}
              currentTransition={transition}
              onTransitionChange={onTransitionChange}
            />
            <div className="space-y-2">
              {TRANSITIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTransitionChange(t.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                    transition === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{t.label}</span>
                  {transition === t.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "music" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload background music that loops softly during your presentation.
            </p>

            {theme.backgroundMusicUrl ? (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/50">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1 h-8" onClick={toggleMusicPreview}>
                    {isPlayingPreview ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {isPlayingPreview ? "Stop Preview" : "Preview"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
                      setIsPlayingPreview(false);
                      onThemeChange({ ...theme, backgroundMusicUrl: undefined });
                      toast.success("Background music removed");
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">🎵 Music will loop at 15% volume during presentation</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No background music set</p>
            )}

            <input ref={musicFileRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => musicFileRef.current?.click()}>
              <Upload className="w-3 h-3" /> Upload Music File
            </Button>

            <div className="text-[10px] text-muted-foreground space-y-1">
              <p>💡 Tips:</p>
              <p>• Use instrumental tracks for best results</p>
              <p>• MP3 or WAV files work best</p>
              <p>• Press <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground">B</kbd> during presentation to toggle music</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
