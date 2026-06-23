import { useState } from "react";
import { Users, Plus, Crown, ShieldCheck, Eye, UserMinus, Mail, Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useTeams, useTeamMembers, useCreateTeam, useInviteTeamMember, useRemoveTeamMember, type Team } from "@/hooks/useTeams";
import TeamActivityFeed from "@/components/teams/TeamActivityFeed";
import { useHasTier } from "@/hooks/useSubscription";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const roleConfig: Record<string, { icon: typeof Crown; label: string; color: string }> = {
  owner: { icon: Crown, label: "Owner", color: "text-primary" },
  admin: { icon: ShieldCheck, label: "Admin", color: "text-blue-500" },
  member: { icon: Users, label: "Member", color: "text-muted-foreground" },
  viewer: { icon: Eye, label: "Viewer", color: "text-muted-foreground" },
};

export default function TeamsPage() {
  const { data: teams = [], isLoading } = useTeams();
  const createTeam = useCreateTeam();
  const hasTeamTier = useHasTier("team");

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const activeTeam = selectedTeam || teams[0] || null;

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    const team = await createTeam.mutateAsync(newTeamName.trim());
    setNewTeamName("");
    setCreateOpen(false);
    setSelectedTeam(team);
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Teams
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Collaborate with your team on shared presentations.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-gold text-primary-foreground font-semibold gap-1.5">
                <Plus className="w-4 h-4" /> New Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="bg-secondary border-border"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                />
                <Button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim() || createTeam.isPending}
                  className="w-full bg-gradient-gold text-primary-foreground"
                >
                  {createTeam.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Team
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Team selector */}
        {teams.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {teams.map((t) => (
              <Badge
                key={t.id}
                variant={activeTeam?.id === t.id ? "default" : "secondary"}
                className="cursor-pointer text-xs px-3 py-1"
                onClick={() => setSelectedTeam(t)}
              >
                {t.name}
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <Card className="p-12 flex items-center justify-center">
            <LoadingSpinner size="sm" />
          </Card>
        ) : teams.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-border">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-1">No teams yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Create a team to start collaborating on presentations with others.
            </p>
            <Button className="bg-gradient-gold text-primary-foreground" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Your First Team
            </Button>
          </Card>
        ) : activeTeam ? (
          <TeamDetail team={activeTeam} />
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function TeamDetail({ team }: { team: Team }) {
  const { data: members = [], isLoading } = useTeamMembers(team.id);
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteOpen, setInviteOpen] = useState(false);

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    await inviteMember.mutateAsync({ teamId: team.id, email: inviteEmail.trim(), role: inviteRole });
    setInviteEmail("");
    setInviteOpen(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-lg">{team.name}</h2>
              <p className="text-xs text-muted-foreground">{activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  placeholder="Email address"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-secondary border-border"
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviteMember.isPending}
                  className="w-full bg-gradient-gold text-primary-foreground"
                >
                  {inviteMember.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send Invite
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Members list */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <div className="space-y-1">
            <AnimatePresence>
              {activeMembers.map((member) => {
                const rc = roleConfig[member.role] || roleConfig.member;
                const RoleIcon = rc.icon;
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {(member.profile?.display_name || member.invited_email || "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.profile?.display_name || member.invited_email || "Unknown"}</p>
                        {member.invited_email && member.profile?.display_name && (
                          <p className="text-[11px] text-muted-foreground">{member.invited_email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-[10px] gap-1 ${rc.color}`}>
                        <RoleIcon className="w-3 h-3" /> {rc.label}
                      </Badge>
                      {member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMember.mutate({ memberId: member.id, teamId: member.team_id })}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Pending invites */}
            {pendingMembers.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pending Invites</p>
                </div>
                {pendingMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg opacity-60">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-secondary text-muted-foreground text-xs">
                          <Mail className="w-3.5 h-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm">{member.invited_email || "Unknown"}</p>
                        <p className="text-[11px] text-muted-foreground">Invite pending</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMember.mutate({ memberId: member.id, teamId: member.team_id })}
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>

      {/* Avatar stack preview */}
      <Card className="p-5 bg-card border-border">
        <h3 className="font-display font-semibold text-sm mb-3">Team Overview</h3>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {activeMembers.slice(0, 5).map((m) => (
              <Avatar key={m.id} className="w-8 h-8 border-2 border-card">
                <AvatarImage src={m.profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                  {(m.profile?.display_name || m.invited_email || "?")[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {activeMembers.length > 5 && (
              <Avatar className="w-8 h-8 border-2 border-card">
                <AvatarFallback className="bg-secondary text-muted-foreground text-[10px]">
                  +{activeMembers.length - 5}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
            {pendingMembers.length > 0 && `, ${pendingMembers.length} pending`}
          </p>
        </div>
      </Card>
      {/* Team Activity Feed */}
      <TeamActivityFeed teamId={team.id} />
    </motion.div>
  );
}
