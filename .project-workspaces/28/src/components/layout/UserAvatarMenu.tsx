import { LogOut, Settings, User, CreditCard, Crown, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

const UserAvatarMenu = () => {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: subscription } = useSubscription();
  const isAdmin = subscription?.is_admin ?? false;

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full ring-2 ring-border hover:ring-primary/50 transition-all focus:outline-none">
          <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.display_name || "User"} />}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isAdmin && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background hidden sm:flex">
              <Crown className="w-3 h-3 text-primary-foreground" />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{profile?.display_name || "User"}</p>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wide">
                <Crown className="w-2.5 h-2.5" /> Admin
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{profile?.bio || "PresentQ Member"}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
          <User className="w-4 h-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
          <Settings className="w-4 h-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/pricing")} className="gap-2 cursor-pointer">
          <CreditCard className="w-4 h-4" /> Billing
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2 cursor-pointer text-primary">
              <Shield className="w-4 h-4" /> Admin Hub
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserAvatarMenu;
