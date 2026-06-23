import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { X, Sparkles, RotateCcw, History, ChevronLeft, Trash2 } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useArc, ArcMode } from "./ArcProvider";
import { useArcConversations, useDeleteArcConversation, useDeleteAllArcConversations } from "@/hooks/useArcConversations";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ArcWelcome from "./ArcWelcome";
import ArcMessageList from "./ArcMessageList";
import ArcInputBar from "./ArcInputBar";
import CrossPromoCard from "@/components/shared/CrossPromoCard";
import { Target } from "lucide-react";

const ArcChatPanel = ({ inline = false, showHistoryOverride, onShowHistoryChange }: { inline?: boolean; showHistoryOverride?: boolean; onShowHistoryChange?: (v: boolean) => void }) => {
  const {
    messages, isOpen, isLoading, mode, setMode, toggleChat, sendMessage,
    resetConversation, loadConversation, saveCurrentConversation, currentConversationId,
    setActivePresentationId,
    teleprompterCallbackRef,
  } = useArc();
  const [showHistoryLocal, setShowHistoryLocal] = useState(false);
  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null);
  const [selectedPresentationTitle, setSelectedPresentationTitle] = useState<string | null>(null);
  const showHistory = showHistoryOverride ?? showHistoryLocal;
  const setShowHistory = onShowHistoryChange ?? setShowHistoryLocal;
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useArcConversations();
  const deleteConversation = useDeleteArcConversation();
  const deleteAll = useDeleteAllArcConversations();

  // Auto-save on close
  const prevMessagesLen = useRef(0);
  useEffect(() => {
    if (!isOpen && prevMessagesLen.current > 0 && messages.length > 0) {
      saveCurrentConversation();
    }
    prevMessagesLen.current = messages.length;
  }, [isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleModeChange = (newMode: ArcMode) => {
    setMode(newMode);
    resetConversation();
    setSelectedPresentationId(null);
    setActivePresentationId(null);
    setSelectedPresentationTitle(null);
  };

  const handleSelectPresentation = (id: string | null, title: string | null) => {
    setSelectedPresentationId(id);
    setActivePresentationId(id);
    setSelectedPresentationTitle(title);
  };

  const handleNewConversation = async () => {
    if (messages.length > 0) await saveCurrentConversation();
    resetConversation();
    setShowHistory(false);
  };

  const handleLoadConversation = (conv: typeof conversations[0]) => {
    loadConversation(conv.id, conv.messages as any, conv.mode as ArcMode);
    setShowHistory(false);
  };

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation.mutate(id);
    if (currentConversationId === id) resetConversation();
    toast.success("Conversation deleted");
  };

  const handleDeleteAll = () => {
    deleteAll.mutate();
    resetConversation();
    setShowHistory(false);
    toast.success("All conversations deleted");
  };

  // Swipe-to-dismiss
  const dragY = useMotionValue(0);
  const drawerOpacity = useTransform(dragY, [0, 300], [1, 0.3]);
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) toggleChat();
  }, [toggleChat]);

  const showWelcome = messages.length === 0;

  /* ── History view ── */
  const historyContent = (
    <div className="h-full bg-card flex flex-col overflow-hidden">
      <div className="h-12 flex items-center justify-between px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(false)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-display font-semibold text-sm">History</span>
        </div>
        {conversations.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs text-destructive h-7" onClick={handleDeleteAll}>
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved conversations</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleLoadConversation(conv)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                currentConversationId === conv.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  /* ── Main chat layout ── */
  const chatContent = (
    <div className={`${inline ? "h-full w-full" : "h-full w-full lg:w-[400px] border-l"} border-border bg-card flex flex-col shrink-0`} style={{ overflow: "hidden", maxHeight: "100%" }}>
      {showHistory ? historyContent : (
        <>
          {/* No separate Arc header when inline — merged into page header */}
          {!inline && (
            <div className="h-12 flex items-center justify-between px-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-gold flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-primary-foreground" />
                </div>
                <span className="font-display font-semibold text-sm">Arc</span>
                <span className="text-[10px] text-muted-foreground capitalize bg-secondary px-1.5 py-0.5 rounded-full">{mode === "rewrite" ? "Remix" : mode}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(true)} title="History">
                  <History className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewConversation} title="New chat">
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleChat}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Scrollable body */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {showWelcome ? (
              <ArcWelcome
                mode={mode}
                onModeChange={handleModeChange}
                onSendMessage={(msg) => sendMessage(msg, selectedPresentationId ?? undefined)}
                conversationCount={conversations.length}
                onShowHistory={() => setShowHistory(true)}
                selectedPresentationId={selectedPresentationId}
                onSelectPresentation={handleSelectPresentation}
              />
            ) : (
              <div className="p-4 space-y-4">
                <ArcMessageList
                  messages={messages}
                  isLoading={isLoading}
                  teleprompterCallbackRef={teleprompterCallbackRef}
                />
                {!isLoading && messages.length >= 4 && messages[messages.length - 1]?.role === "assistant" && (
                  <CrossPromoCard
                    title="Ready to capture leads?"
                    description="Your deck tells the story — now let IntoIQ build the funnel that converts viewers into customers"
                    ctaText="Create Landing Page"
                    ctaUrl="https://intoiq.app"
                    icon={<Target className="w-4 h-4 text-primary" />}
                    dismissKey="promo-intoiq-arc"
                  />
                )}
              </div>
            )}
          </div>

          {/* Input — always at bottom */}
          <ArcInputBar mode={mode} isLoading={isLoading} onSend={(msg) => sendMessage(msg, selectedPresentationId ?? undefined)} />
        </>
      )}
    </div>
  );

  // Inline mode (Arc page)
  if (inline) return chatContent;

  // Slide-up drawer on mobile, side panel on desktop
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "100%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="h-full hidden sm:block"
          >
            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-50 sm:hidden"
              onClick={toggleChat}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={{ y: dragY, opacity: drawerOpacity, height: "75dvh", bottom: "60px" }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={handleDragEnd}
              className="fixed inset-x-0 z-50 sm:hidden rounded-t-2xl overflow-hidden touch-none flex flex-col"
            >
              <div className="flex justify-center pt-2 pb-1 bg-card cursor-grab active:cursor-grabbing shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {chatContent}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default ArcChatPanel;
