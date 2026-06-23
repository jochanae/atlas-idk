import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ArcProvider, useArc } from "@/components/arc/ArcProvider";
import ArcChatPanel from "@/components/arc/ArcChatPanel";
import ThemeDropdown from "@/components/ThemeDropdown";
import { useNavigate } from "react-router-dom";
import { X, Sparkles, History, RotateCcw, Menu, Sun, Moon, LayoutDashboard, Palette, Library, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";
import { usePresentations } from "@/hooks/usePresentations";

function ArcPageContent() {
  const navigate = useNavigate();
  const { mode, resetConversation, saveCurrentConversation, messages } = useArc();
  const [showHistory, setShowHistory] = useState(false);
  const { theme, setTheme } = useTheme();
  const { data: presentations = [] } = usePresentations();

  const recentPresentations = presentations
    .filter(p => !p.deleted_at)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);

  const handleNewConversation = async () => {
    if (messages.length > 0) await saveCurrentConversation();
    resetConversation();
    setShowHistory(false);
  };

  const handleClose = () => {
    navigate("/dashboard");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Single merged header */}
          <header className="h-12 border-b border-border flex items-center justify-between px-3 bg-card/80 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2.5">
              {/* Arc-specific menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground">
                    <Menu className="w-4 h-4" />
                    <span className="text-xs font-medium">Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {/* Conversation actions */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Conversation</DropdownMenuLabel>
                    <DropdownMenuItem onClick={handleNewConversation} className="gap-2">
                      <RotateCcw className="w-3.5 h-3.5" />
                      New conversation
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowHistory(s => !s)} className="gap-2">
                      <History className="w-3.5 h-3.5" />
                      Conversation history
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  {/* Quick shortcuts */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Shortcuts</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate("/content-library")} className="gap-2">
                      <Library className="w-3.5 h-3.5" />
                      Content Library
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/brand-kit")} className="gap-2">
                      <Palette className="w-3.5 h-3.5" />
                      Brand Kit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/dashboard")} className="gap-2">
                      <LayoutDashboard className="w-3.5 h-3.5" />
                      Dashboard
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  {/* Recent presentations */}
                  {recentPresentations.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent Decks</DropdownMenuLabel>
                        {recentPresentations.map((p) => (
                          <DropdownMenuItem key={p.id} onClick={() => navigate(`/editor/${p.id}`)} className="gap-2">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{p.title}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  )}

                  <DropdownMenuSeparator />

                  {/* Theme toggle */}
                  <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="gap-2">
                    {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-6 h-6 rounded-md bg-gradient-gold flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold text-sm">Arc</span>
              <span className="text-[10px] text-muted-foreground capitalize bg-secondary px-1.5 py-0.5 rounded-full">{mode}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <ThemeDropdown buttonClassName="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(s => !s)} title="History">
                <History className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewConversation} title="New chat">
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full text-muted-foreground hover:text-foreground h-8 w-8" title="Close Arc">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </header>

          {/* Full-width chat */}
          <div className="flex-1 flex overflow-hidden">
            <ArcChatPanel inline showHistoryOverride={showHistory} onShowHistoryChange={setShowHistory} />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function ArcPage() {
  return (
    <ArcProvider standalone>
      <ArcPageContent />
    </ArcProvider>
  );
}
