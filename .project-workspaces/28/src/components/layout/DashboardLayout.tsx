import { ReactNode, useState } from "react";
import { Menu, ChevronDown, ChevronUp, Wand2, Monitor, HelpCircle, FolderOpen, MessageSquarePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ArcChatPanel from "@/components/arc/ArcChatPanel";
import { ArcProvider } from "@/components/arc/ArcProvider";
import { Button } from "@/components/ui/button";
import { PresentQLogo } from "@/components/PresentQLogo";
import UserAvatarMenu from "@/components/layout/UserAvatarMenu";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import GlobalSearchModal from "@/components/dashboard/GlobalSearchModal";
import FileHubDialog from "@/components/dashboard/FileHubDialog";
import ThemeDropdown from "@/components/ThemeDropdown";
import NotificationCenter from "@/components/NotificationCenter";
import FeedbackWidget from "@/components/FeedbackWidget";

/**
 * ⚠️  SHARED LAYOUT — DO NOT MODIFY without running full test suite.
 * Changes here affect every dashboard page. Avoid adding overflow-hidden,
 * overflow-x-auto, or z-index changes without verifying dropdown/portal visibility.
 */
interface DashboardLayoutProps {
  children: ReactNode;
}

const toolbarActions = [
  { icon: Wand2, label: "AI Builder", href: "/arc" },
  { icon: Monitor, label: "Teleprompter", href: "/teleprompter" },
  { icon: HelpCircle, label: "Help", href: "/help" },
];

const DashboardHeader = () => {
  const { toggleSidebar } = useSidebar();
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <>
      <header className="h-14 flex items-center justify-between px-2 sm:px-4 bg-card/60 backdrop-blur-2xl sticky top-0 z-40 rounded-b-2xl shadow-[0_4px_24px_-4px_hsl(var(--primary)/0.08)] border-b border-white/10 gap-1 sm:gap-2">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
          <SidebarTrigger className="hidden sm:flex" />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="sm:hidden h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 flex flex-col items-center justify-center gap-0"
          >
            <Menu className="w-4 h-4" />
            <span className="text-[7px] leading-none font-medium">Menu</span>
          </Button>
          <PresentQLogo size="sm" showText className="min-w-0" />
        </div>

        {/* Right: Search + Files (desktop) + Tools toggle + Theme + Avatar */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          {/* Search — hide on tiny screens, show icon-only on small */}
          <div className="hidden sm:block max-w-[200px]">
            <GlobalSearchModal />
          </div>

          {/* Files — desktop only */}
          <FileHubDialog>
            <Button variant="ghost" size="icon" className="hidden sm:flex rounded-full text-muted-foreground hover:text-foreground h-8 w-8" title="My Files">
              <FolderOpen className="w-4 h-4" />
            </Button>
          </FileHubDialog>

          {/* Tools toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setToolsOpen(!toolsOpen)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 flex flex-col items-center justify-center gap-0 border border-border/80 shadow-sm bg-card/50 backdrop-blur-sm hover:bg-card transition-colors"
            title={toolsOpen ? "Hide tools" : "Show tools"}
          >
            <span className="text-[7px] leading-none font-medium text-foreground/80">{toolsOpen ? "Hide" : "Tools"}</span>
            {toolsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>

          {/* Notifications */}
          <NotificationCenter />

          {/* Theme */}
          <ThemeDropdown />

          <UserAvatarMenu />
        </div>
      </header>

      {/* Expandable Tools Toolbar — centered items */}
      <AnimatePresence>
        {toolsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="sticky top-14 z-30"
          >
            <div className="bg-card/60 backdrop-blur-xl border-b border-border/50 px-3 sm:px-4 py-2.5">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {toolbarActions.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 border border-border/60 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 transition-all whitespace-nowrap shrink-0"
                  >
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                    {item.label}
                  </Link>
                ))}
                {/* Mobile-only: Files */}
                <FileHubDialog>
                  <button className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 border border-border/60 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 transition-all whitespace-nowrap shrink-0">
                    <FolderOpen className="w-3.5 h-3.5 text-primary" />
                    My Files
                  </button>
                </FileHubDialog>
                {/* Mobile-only: Feedback */}
                <FeedbackWidget
                  inline
                  trigger={
                    <button className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/80 border border-border/60 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 transition-all whitespace-nowrap shrink-0">
                      <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
                      Feedback
                    </button>
                  }
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <ArcProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <DashboardHeader />
            {/* Content */}
            <main className="flex-1 overflow-auto pb-24 sm:pb-0">
              {children}
            </main>
            {/* Dashboard footer */}
            <footer className="hidden sm:flex items-center justify-center gap-4 py-3 text-[11px] text-muted-foreground shrink-0 bg-card/60 backdrop-blur-2xl rounded-t-2xl shadow-[0_-4px_24px_-4px_hsl(var(--primary)/0.08)] border-t border-white/10">
              <Link to="/help" className="hover:text-foreground transition-colors">Help & How-to</Link>
              <span className="text-border">·</span>
              <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
              <span className="text-border">·</span>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <span className="text-border">·</span>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <span className="text-border">·</span>
              <span>© {new Date().getFullYear()} PresentQ</span>
            </footer>
          </div>
          <ArcChatPanel />
          {/* Desktop floating feedback button */}
          <FeedbackWidget />
        </div>
        <MobileBottomNav />
      </SidebarProvider>
    </ArcProvider>
  );
};

export default DashboardLayout;
