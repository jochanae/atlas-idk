import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, Layers, Shield, Activity, Search, ChevronDown, Crown,
  BarChart3, TrendingUp, Loader2, ShieldAlert, Video, CalendarDays, BookOpen, MessageSquare, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminLearningContent from "@/components/admin/AdminLearningContent";
import AdminEvents from "@/components/admin/AdminEvents";
import AdminKnowledgeBase from "@/components/admin/AdminKnowledgeBase";
import AdminFeedback from "@/components/admin/AdminFeedback";
import AdminBlog from "@/components/admin/AdminBlog";

/* ── Types ── */
interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface PresentationStat {
  user_id: string;
  count: number;
}

/* ── Hooks ── */
function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return profiles as UserProfile[];
    },
  });
}

function useAdminRoles() {
  return useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return data as UserRole[];
    },
  });
}

function useAdminPresentationCounts() {
  return useQuery({
    queryKey: ["admin-presentation-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentations")
        .select("user_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p: { user_id: string }) => {
        counts[p.user_id] = (counts[p.user_id] || 0) + 1;
      });
      return counts;
    },
  });
}

function usePlatformStats() {
  return useQuery({
    queryKey: ["admin-platform-stats"],
    queryFn: async () => {
      const [profiles, presentations, slides, views] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("presentations").select("id", { count: "exact", head: true }),
        supabase.from("slides").select("id", { count: "exact", head: true }),
        supabase.from("presentation_views").select("id", { count: "exact", head: true }),
      ]);
      return {
        totalUsers: profiles.count ?? 0,
        totalPresentations: presentations.count ?? 0,
        totalSlides: slides.count ?? 0,
        totalViews: views.count ?? 0,
      };
    },
  });
}

/* ── Component ── */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: subscription } = useSubscription();
  const isAdmin = subscription?.is_admin ?? false;

  const { data: users = [], isLoading: usersLoading } = useAdminUsers();
  const { data: roles = [] } = useAdminRoles();
  const { data: presCounts = {} } = useAdminPresentationCounts();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();

  const [search, setSearch] = useState("");

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="w-16 h-16 text-destructive/50" />
          <h1 className="font-display text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground text-sm">You don't have admin privileges.</p>
          <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  const roleMap = new Map<string, string[]>();
  roles.forEach((r) => {
    const existing = roleMap.get(r.user_id) || [];
    existing.push(r.role);
    roleMap.set(r.user_id, existing);
  });

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.display_name?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-blue-500" },
    { label: "Presentations", value: stats?.totalPresentations ?? "—", icon: Layers, color: "text-primary" },
    { label: "Total Slides", value: stats?.totalSlides ?? "—", icon: BarChart3, color: "text-emerald-500" },
    { label: "Total Views", value: stats?.totalViews ?? "—", icon: TrendingUp, color: "text-violet-500" },
  ];

  const handleAssignRole = async (userId: string, role: "admin" | "moderator" | "user") => {
    const { error } = await supabase
      .from("user_roles")
      .upsert([{ user_id: userId, role }], { onConflict: "user_id,role" });
    if (error) {
      toast.error("Failed to assign role");
    } else {
      toast.success(`Role "${role}" assigned`);
    }
  };

  const handleRemoveRole = async (userId: string, role: "admin" | "moderator" | "user") => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) {
      toast.error("Failed to remove role");
    } else {
      toast.success(`Role "${role}" removed`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Platform management & user oversight</p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <div>
                      {statsLoading ? (
                        <div className="h-7 w-12 animate-pulse rounded bg-muted" />
                      ) : (
                        <p className="text-2xl font-display font-bold">{stat.value}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tabs for different admin sections */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="w-4 h-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5">
              <Video className="w-4 h-4" /> Learning Content
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5">
              <CalendarDays className="w-4 h-4" /> Events
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1.5">
              <BookOpen className="w-4 h-4" /> Knowledge Base
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5">
              <MessageSquare className="w-4 h-4" /> Feedback
            </TabsTrigger>
            <TabsTrigger value="blog" className="gap-1.5">
              <FileText className="w-4 h-4" /> Blog
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="font-display text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    User Management
                  </CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {usersLoading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Roles</TableHead>
                          <TableHead className="text-center">Decks</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map((user) => {
                            const userRoles = roleMap.get(user.id) || [];
                            const deckCount = presCounts[user.id] || 0;
                            const initials = (user.display_name || "U")
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2);

                            return (
                              <TableRow key={user.id}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={user.avatar_url || undefined} />
                                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {user.display_name || "Unnamed User"}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate font-mono">
                                        {user.id.slice(0, 8)}…
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {userRoles.length > 0 ? (
                                      userRoles.map((role) => (
                                        <Badge
                                          key={role}
                                          variant={role === "admin" ? "default" : "secondary"}
                                          className="text-xs cursor-pointer"
                                          onClick={() => handleRemoveRole(user.id, role as "admin" | "moderator" | "user")}
                                          title="Click to remove"
                                        >
                                          {role === "admin" && <Crown className="w-3 h-3 mr-1" />}
                                          {role}
                                        </Badge>
                                      ))
                                    ) : (
                                      <span className="text-xs text-muted-foreground">user</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="text-sm font-medium">{deckCount}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 gap-1">
                                        Manage <ChevronDown className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {!userRoles.includes("admin") && (
                                        <DropdownMenuItem onClick={() => handleAssignRole(user.id, "admin")}>
                                          <Crown className="w-3.5 h-3.5 mr-2" /> Make Admin
                                        </DropdownMenuItem>
                                      )}
                                      {!userRoles.includes("moderator") && (
                                        <DropdownMenuItem onClick={() => handleAssignRole(user.id, "moderator")}>
                                          <Shield className="w-3.5 h-3.5 mr-2" /> Make Moderator
                                        </DropdownMenuItem>
                                      )}
                                      {userRoles.includes("admin") && (
                                        <DropdownMenuItem
                                          onClick={() => handleRemoveRole(user.id, "admin")}
                                          className="text-destructive"
                                        >
                                          Remove Admin
                                        </DropdownMenuItem>
                                      )}
                                      {userRoles.includes("moderator") && (
                                        <DropdownMenuItem
                                          onClick={() => handleRemoveRole(user.id, "moderator")}
                                          className="text-destructive"
                                        >
                                          Remove Moderator
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Learning Content Tab */}
          <TabsContent value="content">
            <AdminLearningContent />
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events">
            <AdminEvents />
          </TabsContent>

          {/* Knowledge Base Tab */}
          <TabsContent value="knowledge">
            <AdminKnowledgeBase />
          </TabsContent>

          {/* Feedback Tab */}
          <TabsContent value="feedback">
            <AdminFeedback />
          </TabsContent>
          <TabsContent value="blog">
            <AdminBlog />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
