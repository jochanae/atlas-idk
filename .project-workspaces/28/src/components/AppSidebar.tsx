import { useState } from "react";
import {
  LayoutDashboard, Settings, CreditCard, BookmarkPlus, Palette,
  LayoutTemplate, BarChart3, Gift, Sparkles, Mic, Monitor, Users,
  Smartphone, BookOpen, FolderOpen, FileDown, Zap, Subtitles,
  Package, Brain, ChevronDown, Shield, FileText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import FileHubDialog from "@/components/dashboard/FileHubDialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { PresentQLogo } from "@/components/PresentQLogo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/* ---- Navigation structure ---- */
const coreItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Content Library", url: "/library", icon: BookmarkPlus },
  { title: "Brand Kit", url: "/brand-kit", icon: Palette },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Marketplace", url: "/marketplace", icon: Gift },
];

const resourceItems = [
  { title: "Resources Hub", url: "/resources-dashboard", icon: Package },
  { title: "Audience Resources", url: "/resources", icon: FileDown },
  { title: "Follow-Up", url: "/follow-up", icon: Zap },
  { title: "Visual Assets", url: "/visual-assets", icon: Subtitles },
];

const performItems = [
  { title: "Arc AI", url: "/arc", icon: Sparkles },
  { title: "Teleprompter", url: "/teleprompter", icon: Monitor },
  { title: "Coaching", url: "/coaching", icon: Brain },
  { title: "Rehearsal", url: "/rehearse", icon: Mic },
  { title: "Remote", url: "/remote", icon: Smartphone },
];

const bottomItems = [
  { title: "Teams", url: "/teams", icon: Users },
  { title: "Help & Learn", url: "/help", icon: BookOpen },
  { title: "Referrals", url: "/referrals", icon: Gift },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
];

const adminItems = [
  { title: "Admin Hub", url: "/admin", icon: Shield },
  { title: "Blog Manager", url: "/admin/blog", icon: FileText },
];

type NavItem = { title: string; url: string; icon: any };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { data: subscription } = useSubscription();
  const isAdmin = subscription?.is_admin ?? false;

  /* Auto-expand group if current route is inside it */
  const isInGroup = (items: NavItem[]) => items.some(i => location.pathname.startsWith(i.url));
  const [resourcesOpen, setResourcesOpen] = useState(isInGroup(resourceItems));
  const [performOpen, setPerformOpen] = useState(isInGroup(performItems));

  const renderItems = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <NavLink
              to={item.url}
              end
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              {...(item.title === "Audience Resources" ? { "data-tour": "resources-link" } : {})}
              {...(item.title === "Arc AI" ? { "data-tour": "arc-chat" } : {})}
              {...(item.title === "Help & Learn" ? { "data-tour": "help-link" } : {})}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  const renderSection = (items: NavItem[], label: string) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/60 px-4 mb-2">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {renderItems(items)}
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderCollapsible = (items: NavItem[], label: string, open: boolean, setOpen: (o: boolean) => void) => (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 group cursor-pointer">
          <span className="text-xs uppercase tracking-wider text-muted-foreground/60">{label}</span>
          {!collapsed && (
            <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform", open && "rotate-180")} />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            {renderItems(items)}
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
        <PresentQLogo size="sm" showText={false} className={collapsed ? "mx-auto" : ""} />
      </div>
      <SidebarContent className="pt-4 flex flex-col justify-between">
        <div>
          {/* Core — always visible */}
          {renderSection(coreItems, "Main")}

          {/* File Hub */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <FileHubDialog>
                    <SidebarMenuButton className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer">
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>My Files</span>}
                    </SidebarMenuButton>
                  </FileHubDialog>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Resources — collapsible */}
          {renderCollapsible(resourceItems, "Resources", resourcesOpen, setResourcesOpen)}

          {/* Admin — only visible to admins */}
          {isAdmin && renderSection(adminItems, "Admin")}

          {/* Perform — collapsible */}
          {renderCollapsible(performItems, "Perform", performOpen, setPerformOpen)}
        </div>

        {/* Bottom settings */}
        {renderSection(bottomItems, "More")}
      </SidebarContent>
    </Sidebar>
  );
}
