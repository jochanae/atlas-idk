import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, Layout, Settings, BarChart3, Users, Palette, BookOpen, Mic, Command, Tag } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { usePresentations } from "@/hooks/usePresentations";
import { useSearchByTag } from "@/hooks/useContentIntelligence";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: Layout },
  { label: "Templates", path: "/templates", icon: BookOpen },
  { label: "Brand Kit", path: "/brand-kit", icon: Palette },
  { label: "Content Library", path: "/library", icon: FileText },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Teams", path: "/teams", icon: Users },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "Teleprompter", path: "/teleprompter", icon: Mic },
];

export default function GlobalSearchModal() {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const navigate = useNavigate();
  const { data: presentations = [] } = usePresentations();
  const { data: tagResults = [] } = useSearchByTag(searchValue);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const recentDecks = useMemo(
    () => [...presentations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8),
    [presentations]
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60 border border-border shadow-sm text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono border border-border">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearchValue(""); }}>
        <CommandInput placeholder="Search decks, tags, pages…" value={searchValue} onValueChange={setSearchValue} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {recentDecks.length > 0 && (
            <CommandGroup heading="Decks">
              {recentDecks.map((p) => (
                <CommandItem key={p.id} onSelect={() => go(`/editor/${p.id}`)}>
                  <FileText className="mr-2 h-4 w-4 text-primary" />
                  <span className="truncate">{p.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {tagResults.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Tag Matches">
                {tagResults.slice(0, 6).map((t: any) => (
                  <CommandItem key={t.id} onSelect={() => go(`/editor/${t.presentation_id}`)}>
                    <Tag className="mr-2 h-4 w-4 text-accent" />
                    <span className="truncate">{t.tag}</span>
                    <span className="ml-auto text-xs text-muted-foreground truncate">{(t as any).presentations?.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map((item) => (
              <CommandItem key={item.path} onSelect={() => go(item.path)}>
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
