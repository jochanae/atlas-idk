import { useState } from "react";
import {
  LayoutDashboard, LayoutTemplate, BookmarkPlus, BarChart3,
  MessageCircle, Settings, Mic, Users, HelpCircle, SlidersHorizontal, X, Check,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useArc } from "@/components/arc/ArcProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NavTab {
  icon: LucideIcon;
  label: string;
  to: string;
}

const ALL_TABS: NavTab[] = [
  { icon: LayoutDashboard, label: "Home", to: "/dashboard" },
  { icon: LayoutTemplate, label: "Templates", to: "/templates" },
  { icon: BookmarkPlus, label: "Library", to: "/library" },
  { icon: BarChart3, label: "Analytics", to: "/analytics" },
  { icon: Settings, label: "Settings", to: "/settings" },
  { icon: Mic, label: "Practice", to: "/rehearsal" },
  { icon: Users, label: "Teams", to: "/teams" },
  { icon: HelpCircle, label: "Help", to: "/help" },
];

const DEFAULT_LEFT: NavTab[] = [ALL_TABS[0], ALL_TABS[1]];
const DEFAULT_RIGHT: NavTab[] = [ALL_TABS[3], ALL_TABS[2]];

const MobileBottomNav = () => {
  const { toggleChat } = useArc();
  const [editOpen, setEditOpen] = useState(false);
  const [leftTabs, setLeftTabs] = useState<NavTab[]>(DEFAULT_LEFT);
  const [rightTabs, setRightTabs] = useState<NavTab[]>(DEFAULT_RIGHT);
  const [editingSide, setEditingSide] = useState<"left" | "right">("left");
  const [draftTabs, setDraftTabs] = useState<NavTab[]>([]);

  const openEdit = () => {
    setEditingSide("left");
    setDraftTabs([...leftTabs]);
    setEditOpen(true);
  };

  const toggleTab = (tab: NavTab) => {
    const exists = draftTabs.find((t) => t.to === tab.to);
    if (exists) {
      setDraftTabs(draftTabs.filter((t) => t.to !== tab.to));
    } else if (draftTabs.length < 2) {
      setDraftTabs([...draftTabs, tab]);
    }
  };

  const switchSide = (side: "left" | "right") => {
    // Save current draft before switching
    if (editingSide === "left") setLeftTabs(draftTabs.length === 2 ? draftTabs : leftTabs);
    else setRightTabs(draftTabs.length === 2 ? draftTabs : rightTabs);

    setEditingSide(side);
    setDraftTabs(side === "left" ? [...leftTabs] : [...rightTabs]);
  };

  const saveEdit = () => {
    if (draftTabs.length === 2) {
      if (editingSide === "left") setLeftTabs(draftTabs);
      else setRightTabs(draftTabs);
    }
    setEditOpen(false);
  };

  const usedTos = new Set([
    ...leftTabs.map((t) => t.to),
    ...rightTabs.map((t) => t.to),
  ]);

  const available = ALL_TABS.filter((t) => {
    if (editingSide === "left") return !rightTabs.find((r) => r.to === t.to);
    return !leftTabs.find((l) => l.to === t.to);
  });

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border sm:hidden safe-area-bottom">
        <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr_auto] h-16 items-end pb-1 relative">
          {/* Left 2 tabs */}
          {leftTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/dashboard"}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground transition-colors"
              activeClassName="text-primary"
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          ))}

          {/* Center Arc button — pulsing edges */}
          <div className="relative flex items-center justify-center px-2">
            <button
              onClick={toggleChat}
              className="relative -top-4 flex flex-col items-center gap-0.5"
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center ring-4 ring-card animate-pulse-glow">
                <MessageCircle className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-[9px] font-semibold text-primary">Arc</span>
            </button>
          </div>

          {/* Right 2 tabs */}
          {rightTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground transition-colors"
              activeClassName="text-primary"
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          ))}

          {/* Inline edit button */}
          <button
            onClick={openEdit}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            aria-label="Edit shortcuts"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-[9px] font-medium">Edit</span>
          </button>
        </div>
      </nav>

      {/* Edit shortcuts dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Shortcuts</DialogTitle>
          </DialogHeader>

          {/* Side picker */}
          <div className="flex gap-2 mb-4">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                onClick={() => switchSide(side)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                  editingSide === side
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-secondary text-muted-foreground border border-border"
                }`}
              >
                {side} Side
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            Choose 2 tabs for the {editingSide} side:
          </p>

          <div className="grid grid-cols-2 gap-2">
            {available.map((tab) => {
              const selected = draftTabs.find((t) => t.to === tab.to);
              return (
                <button
                  key={tab.to}
                  onClick={() => toggleTab(tab)}
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-sm ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={saveEdit}
            disabled={draftTabs.length !== 2}
            className="w-full mt-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 transition-opacity"
          >
            Save Changes
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MobileBottomNav;
