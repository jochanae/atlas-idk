import { useState, useEffect } from "react";
import { User, Camera, Save, Loader2, ExternalLink, Mail, Shield, Lock, Eye, EyeOff } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import CertificationBadges from "@/components/settings/CertificationBadges";

export default function Settings() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const updateProfile = useUpdateProfile();
  const navigate = useNavigate();

  const isPro = subscription?.subscribed ?? false;

  const [userEmail, setUserEmail] = useState("");
  const [authProvider, setAuthProvider] = useState<string>("email");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
        const provider = user.app_metadata?.provider || "email";
        setAuthProvider(provider);
      }
    });
  }, []);

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Could not open subscription portal");
    }
  };

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setDisplayName(profile.display_name || "");
    setBio(profile.bio || "");
    setInitialized(true);
  }

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSave = () => {
    updateProfile.mutate({ display_name: displayName, bio });
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password set! You can now sign in with email & password too.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Could not set password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner size="md" text="Loading settings…" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-8">Manage your profile and subscription.</p>

        {/* Profile */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display font-semibold text-lg mb-4">Profile</h2>
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="w-16 h-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-display font-bold text-xl">
                {displayName?.[0]?.toUpperCase() || <User className="w-6 h-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display font-semibold">{displayName || "No name set"}</p>
              <p className="text-xs text-muted-foreground">Update your photo and details below</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Display Name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Bio</label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="bg-secondary border-border" rows={3} placeholder="Tell us about yourself..." />
            </div>
            <Button onClick={handleSave} disabled={updateProfile.isPending} className="bg-gradient-gold text-primary-foreground">
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </Card>

        {/* Account / Login Method */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Account
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{userEmail || "Not set"}</p>
              </div>
              <Badge variant="secondary" className="capitalize text-xs">
                {authProvider === "google" ? "Google" : authProvider === "apple" ? "Apple" : "Email"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {authProvider === "google"
                ? "You signed in with Google. Your account is linked to this Google email."
                : authProvider === "apple"
                ? "You signed in with Apple. Your account is linked to this Apple ID."
                : "You signed in with email and password."}
            </p>

            {/* Set / Update Password */}
            <div className="pt-3 border-t border-border">
              <p className="text-sm font-medium mb-1">
                {authProvider !== "email" ? "Add Email & Password Login" : "Update Password"}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {authProvider !== "email"
                  ? "Set a password so you can also sign in with your email and password."
                  : "Change your current password."}
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="New password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10 bg-secondary border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-secondary border-border"
                />
                <Button
                  onClick={handleSetPassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  size="sm"
                  className="bg-gradient-gold text-primary-foreground"
                >
                  {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  {authProvider !== "email" ? "Set Password" : "Update Password"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
        {/* Teaching Badges */}
        <Card className="p-6 bg-card border-border mb-6">
          <CertificationBadges />
        </Card>

        {/* Subscription */}
        <Card className="p-6 bg-card border-border">
          <h2 className="font-display font-semibold text-lg mb-4">Subscription</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium capitalize">{isPro ? "Pro" : "Free"} Plan</p>
              <p className="text-xs text-muted-foreground">
                {isPro && subscription?.subscription_end
                  ? `Renews ${new Date(subscription.subscription_end).toLocaleDateString()}`
                  : "Upgrade for unlimited features"}
              </p>
            </div>
            {isPro ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleManageSubscription}>
                <ExternalLink className="w-3 h-3" /> Manage
              </Button>
            ) : (
              <Button size="sm" className="bg-gradient-gold text-primary-foreground" onClick={() => navigate("/pricing")}>
                Upgrade to Pro
              </Button>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
