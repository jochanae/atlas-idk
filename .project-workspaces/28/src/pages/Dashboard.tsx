import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Layers, Loader2, Upload, Lock, ArrowRight, Search, Trash2, RotateCcw, FolderPlus, X, Users, Pause, Play, Sparkles } from "lucide-react";
import ImportPresentationDialog from "@/components/ImportPresentationDialog";
import GenerateDeckDialog from "@/components/dashboard/GenerateDeckDialog";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { usePresentations, useCreatePresentation, useSoftDeletePresentation, useDuplicatePresentation, useTrashPresentations, useRestorePresentation, useDeletePresentation } from "@/hooks/usePresentations";
import { useSubscription, FREE_DECK_LIMIT } from "@/hooks/useSubscription";
import { useProfile } from "@/hooks/useProfile";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import PresentationCard from "@/components/dashboard/PresentationCard";
import { OnboardingWelcome } from "@/components/OnboardingWelcome";
import { GuidedTour } from "@/components/GuidedTour";
import { useTeamSharedPresentations, useBatchDeckCollaborators } from "@/hooks/useTeamPresentations";
import { useFirstSlides } from "@/hooks/useFirstSlides";
import { useRemixPresentation } from "@/hooks/useRemixPresentation";
import RemixDialog from "@/components/dashboard/RemixDialog";
import LiveLearnCard from "@/components/dashboard/LiveLearnCard";
import FileHubDialog from "@/components/dashboard/FileHubDialog";
import DashboardCalendar from "@/components/dashboard/DashboardCalendar";
import RecordingsGallery from "@/components/dashboard/RecordingsGallery";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";

const presentationTips = [
  "Start with your audience's biggest pain point — not your bio.",
  "Use the rule of three for memorable key messages.",
  "Practice your opening 3x — first impressions are everything.",
  "Visual slides outperform text-heavy ones by 43%.",
  "End with a clear call-to-action, not 'Any questions?'",
  "Record yourself rehearsing to catch filler words.",
  "Pause for 2 seconds after a key point — silence is powerful.",
  "One idea per slide keeps your audience focused.",
  "Use the teleprompter to nail your timing before going live.",
  "Stories are 22x more memorable than facts alone.",
  "Rehearse transitions — they're where most speakers stumble.",
  "Open with a question to instantly engage the room.",
  "Keep your deck under 15 slides for a 20-minute talk.",
  "Use Arc AI to generate a first draft, then make it yours.",
  "Export to PDF for a leave-behind your audience will actually read.",
  "Brand consistency builds trust — set up your Brand Kit.",
  "Remixing a past deck is faster than starting from scratch.",
  "Use speaker notes as guardrails, not a script.",
];

function RotatingTipLine() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * presentationTips.length));
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % presentationTips.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [paused]);

  return (
    <div className="ml-0 sm:ml-9 mt-1 px-3 py-1.5 rounded-lg bg-primary/5 shadow-[0_0_8px_-2px_hsl(var(--primary)/0.12)] flex items-start gap-1.5 max-w-full min-w-0">
      <span className="text-[10px] shrink-0 mt-0.5">✨</span>
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
          className="text-[11px] sm:text-xs text-muted-foreground italic min-w-0 break-words leading-relaxed"
        >
          {presentationTips[index]}
        </motion.p>
      </AnimatePresence>
      <button
        onClick={() => setPaused(!paused)}
        className="shrink-0 ml-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors mt-0.5"
        title={paused ? "Resume tips" : "Pause tip"}
      >
        {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
      </button>
    </div>
  );
}


const Dashboard = () => {
  const navigate = useNavigate();
  const { data: presentations = [], isLoading } = usePresentations();
  const { data: trashPresentations = [] } = useTrashPresentations();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: teamShared = [] } = useTeamSharedPresentations();
  const createPres = useCreatePresentation();
  const softDelete = useSoftDeletePresentation();
  const duplicatePres = useDuplicatePresentation();
  const restorePres = useRestorePresentation();
  const permDelete = useDeletePresentation();
  const remixPres = useRemixPresentation();

  // Batch fetch collaborators for all presentations
  const allPresIds = useMemo(() => presentations.map((p) => p.id), [presentations]);
  const { data: collabMap = {} } = useBatchDeckCollaborators(allPresIds);
  const { data: firstSlideMap = {} } = useFirstSlides(allPresIds);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [remixTargetId, setRemixTargetId] = useState<string | null>(null);
  const [fileHubOpen, setFileHubOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const DECKS_PER_PAGE = 12;

  const remixTarget = presentations.find((p) => p.id === remixTargetId);

  const handleRemixConfirm = useCallback(async (brandKitId: string | null) => {
    if (!remixTargetId) return;
    const result = await remixPres.mutateAsync({ sourceId: remixTargetId, brandKitId });
    setRemixTargetId(null);
    navigate(`/editor/${result.id}`);
  }, [remixTargetId, remixPres, navigate]);

  const isPro = subscription?.subscribed ?? false;
  const isAdmin = subscription?.is_admin ?? false;
  const atLimit = !isPro && presentations.length >= FREE_DECK_LIMIT;
  const tier = subscription?.tier ?? "free";
  const firstName = profile?.display_name?.split(" ")[0] || "Creator";

  // Extract unique folders
  const folders = useMemo(() => {
    const set = new Set<string>();
    presentations.forEach((p) => { if (p.folder) set.add(p.folder); });
    return Array.from(set).sort();
  }, [presentations]);

  // Filter presentations
  const filteredPresentations = useMemo(() => {
    let list = [...presentations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    if (activeFolder) list = list.filter((p) => p.folder === activeFolder);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    }
    return list;
  }, [presentations, activeFolder, searchQuery]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filteredPresentations.length / DECKS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPresentations = filteredPresentations.slice((safeCurrentPage - 1) * DECKS_PER_PAGE, safeCurrentPage * DECKS_PER_PAGE);

  // Reset to page 1 when search/folder changes
  const filterKey = `${searchQuery}|${activeFolder}`;
  useMemo(() => { setCurrentPage(1); }, [filterKey]);

  const handleCreate = async () => {
    if (atLimit) {
      toast.error(`Free plan is limited to ${FREE_DECK_LIMIT} presentations. Upgrade to Pro for unlimited decks.`);
      navigate("/pricing");
      return;
    }
    const result = await createPres.mutateAsync({});
    navigate(`/editor/${result.id}`);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <DashboardLayout>
      <OnboardingWelcome />
      <GuidedTour />
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
        {/* Unified Greeting + Calendar Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl border border-border bg-card p-3.5 sm:p-6"
        >
          {/* Subtle decorative accents */}
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-primary/5" />
          <div className="absolute right-6 bottom--4 w-28 h-28 rounded-full bg-primary/3" />

          <div className="relative flex flex-col gap-3.5 sm:gap-5">
            {/* Row 1: Greeting + Plan badge */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="text-xl sm:text-2xl shrink-0">🌤️</span>
                  {profileLoading ? (
                    <Skeleton className="h-8 w-52" />
                  ) : (
                    <h1 className="font-display text-base sm:text-xl md:text-2xl font-bold truncate">
                      {getGreeting()}, <span className="text-primary">{firstName}</span>!
                    </h1>
                  )}
                </div>
                {/* Rotating tip */}
                <RotatingTipLine />
                <div className="flex items-center gap-2 mt-2 ml-0 sm:ml-9">
                  {subLoading ? (
                    <Skeleton className="h-5 w-20 rounded-full" />
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                      {tier === "free" ? "Free Plan" : `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {presentations.length} deck{presentations.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Calendar + File Hub shortcut */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-9 flex-wrap"
            >
              <DashboardCalendar />
              <FileHubDialog>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <FolderPlus className="w-3.5 h-3.5 text-primary" />
                  Files
                </Button>
              </FileHubDialog>
            </motion.div>

            {/* Row 3: Action buttons — larger to fill space */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap ml-0 sm:ml-9">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                <GenerateDeckDialog>
                  <Button variant="outline" className="gap-2 border-primary/30 hover:bg-primary/10">
                    <Sparkles className="w-4 h-4 text-primary" />
                    AI Generate
                  </Button>
                </GenerateDeckDialog>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
                <ImportPresentationDialog>
                  <Button variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Import
                  </Button>
                </ImportPresentationDialog>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
                <Button
                  data-tour="new-deck"
                  className="bg-gradient-gold text-primary-foreground font-semibold gap-2"
                  onClick={handleCreate}
                  disabled={createPres.isPending}
                >
                  {createPres.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                  New Deck
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Usage (free only) */}
        {!isPro && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 border border-border">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
            <Progress value={(presentations.length / FREE_DECK_LIMIT) * 100} className="h-1.5 flex-1" />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{presentations.length}/{FREE_DECK_LIMIT}</span>
            {atLimit && (
              <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 shrink-0" onClick={() => navigate("/pricing")}>
                <Lock className="w-3 h-3 mr-1" /> Upgrade
              </Button>
            )}
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search decks..."
              className="pl-8 h-8 text-sm bg-secondary border-border"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={!activeFolder && !showTrash ? "default" : "secondary"}
              className="cursor-pointer text-[11px] px-2.5 py-0.5"
              onClick={() => { setActiveFolder(null); setShowTrash(false); }}
            >
              All
            </Badge>
            {folders.map((f) => (
              <Badge
                key={f}
                variant={activeFolder === f ? "default" : "secondary"}
                className="cursor-pointer text-[11px] px-2.5 py-0.5"
                onClick={() => { setActiveFolder(f); setShowTrash(false); }}
              >
                {f}
              </Badge>
            ))}
            <Badge
              variant={showTrash ? "destructive" : "secondary"}
              className="cursor-pointer text-[11px] px-2.5 py-0.5 gap-1"
              onClick={() => { setShowTrash(!showTrash); setActiveFolder(null); }}
            >
              <Trash2 className="w-2.5 h-2.5" />
              Trash{trashPresentations.length > 0 && ` (${trashPresentations.length})`}
            </Badge>
          </div>
        </div>

        {/* Trash View */}
        {showTrash ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-destructive">Trash</h2>
              {trashPresentations.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive gap-1 h-7"
                  onClick={() => {
                    if (confirm("Permanently delete all trashed presentations?")) {
                      trashPresentations.forEach((p) => permDelete.mutate(p.id));
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" /> Empty Trash
                </Button>
              )}
            </div>
            {trashPresentations.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-border">
                <Trash2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Trash is empty</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 gap-3">
                {trashPresentations.map((pres, i) => (
                  <motion.div key={pres.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card className="bg-card border-border overflow-hidden opacity-70">
                      <div className="w-full aspect-[16/10] bg-secondary/40 border-b border-border flex items-center justify-center">
                        <Layers className="w-7 h-7 text-muted-foreground/20" />
                      </div>
                      <div className="p-4">
                        <h3 className="font-display font-semibold text-sm truncate">{pres.title}</h3>
                        <div className="flex items-center gap-1.5 mt-2">
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => restorePres.mutate(pres.id)}>
                            <RotateCcw className="w-3 h-3" /> Restore
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-destructive" onClick={() => {
                            if (confirm("Permanently delete this presentation?")) permDelete.mutate(pres.id);
                          }}>
                            <Trash2 className="w-3 h-3" /> Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Main Workspace */
          <>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base font-semibold">
                  {activeFolder ? activeFolder : "My Workspace"}
                </h2>
                {filteredPresentations.length > 0 && (
                  <span className="text-xs text-muted-foreground">{filteredPresentations.length} deck{filteredPresentations.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                    <Card className="bg-card border-border/60 overflow-hidden rounded-xl">
                      <div className="w-full aspect-[16/10] bg-muted relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-muted relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />
                        </div>
                        <div className="h-3 w-1/2 rounded bg-muted relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />
                        </div>
                      </div>
                    </Card>
                    </motion.div>
                  ))}
                </div>
              ) : presentations.length === 0 ? (
                <Card className="p-8 sm:p-12 text-center border-dashed border-border">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Layers className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-1">Your workspace is empty</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                    Create your first presentation or let Arc AI build one for you.
                  </p>
                  <Button
                    className="bg-gradient-gold text-primary-foreground font-semibold"
                    onClick={handleCreate}
                    disabled={createPres.isPending}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Create Your First Deck
                  </Button>
                </Card>
              ) : filteredPresentations.length === 0 ? (
                <Card className="p-8 text-center border-dashed border-border">
                  <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No decks match your search</p>
                </Card>
              ) : (
                <>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 gap-3">
                  {paginatedPresentations.map((pres, i) => (
                    <PresentationCard
                      key={pres.id}
                      pres={pres}
                      index={i}
                      onOpen={(id) => navigate(`/editor/${id}`)}
                      onDelete={(id) => softDelete.mutate(id)}
                      onDuplicate={(id) => duplicatePres.mutate(id)}
                      onRemix={(id) => setRemixTargetId(id)}
                      collaborators={collabMap[pres.id] || []}
                      firstSlide={firstSlideMap[pres.id]}
                    />
                  ))}

                  {!atLimit && !searchQuery && !activeFolder && safeCurrentPage === totalPages && (
                    <Card
                      className="border-dashed border-border hover:border-primary/30 transition-all cursor-pointer flex items-center justify-center min-h-[180px]"
                      onClick={handleCreate}
                    >
                      <div className="text-center">
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center mx-auto mb-2">
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">New Deck</p>
                      </div>
                    </Card>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage(safeCurrentPage - 1)}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={page === safeCurrentPage ? "default" : "ghost"}
                          size="sm"
                          className="h-8 w-8 text-xs p-0"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(safeCurrentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
                </>
              )}
            </div>

            {teamShared.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-base font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Shared with You
                  </h2>
                  <span className="text-xs text-muted-foreground">{teamShared.length} deck{teamShared.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teamShared.map((s, i) => (
                    <PresentationCard
                      key={s.id}
                      pres={{
                        id: s.presentation.id,
                        title: s.presentation.title,
                        updated_at: s.presentation.updated_at,
                        goal: s.presentation.goal,
                        folder: s.presentation.folder,
                      }}
                      index={i}
                      onOpen={(id) => navigate(`/editor/${id}`)}
                      onDelete={() => {}}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Recordings & Learn — below workspace */}
        <RecordingsGallery />
        <LiveLearnCard />

      </div>

      <RemixDialog
        open={!!remixTargetId}
        onOpenChange={(open) => !open && setRemixTargetId(null)}
        onConfirm={handleRemixConfirm}
        isLoading={remixPres.isPending}
        presentationTitle={remixTarget?.title}
      />

      <FileHubDialog open={fileHubOpen} onOpenChange={setFileHubOpen} />
    </DashboardLayout>
  );
};

export default Dashboard;
