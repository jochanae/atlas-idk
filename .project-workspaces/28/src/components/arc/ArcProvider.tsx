import { createContext, useContext, useState, ReactNode, useCallback, useRef, MutableRefObject, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSlides } from "@/hooks/useSlides";
import { useCreateSlide } from "@/hooks/useSlides";
import { useUpdateSlide } from "@/hooks/useSlides";
import { useCreatePresentation } from "@/hooks/usePresentations";
import { useArcMemoriesMap, useSaveArcMemory } from "@/hooks/useArcMemory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { PRESET_THEMES, themeToJson } from "@/lib/slideThemes";

export type ArcMode = "chat" | "guided" | "quick" | "coaching" | "rewrite" | "teleprompter";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

interface ArcContextType {
  messages: Message[];
  isOpen: boolean;
  isCommandOpen: boolean;
  isLoading: boolean;
  mode: ArcMode;
  currentConversationId: string | null;
  activePresentationId: string | null;
  teleprompterCallbackRef: MutableRefObject<((text: string) => void) | null>;
  setActivePresentationId: (id: string | null) => void;
  setMode: (mode: ArcMode) => void;
  toggleChat: () => void;
  openCommand: () => void;
  closeCommand: () => void;
  sendMessage: (input: string, attachedPresentationId?: string) => Promise<void>;
  resetConversation: () => void;
  loadConversation: (id: string, messages: Message[], mode: ArcMode) => void;
  saveCurrentConversation: () => Promise<void>;
}

const ArcContext = createContext<ArcContextType | null>(null);

export function useArc() {
  const ctx = useContext(ArcContext);
  if (!ctx) throw new Error("useArc must be used within ArcProvider");
  return ctx;
}

interface ArcProviderProps {
  children: ReactNode;
  standalone?: boolean;
}

export function ArcProvider({ children, standalone = false }: ArcProviderProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(standalone);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ArcMode>("chat");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);

  const teleprompterCallbackRef = useRef<((text: string) => void) | null>(null);
  const { id: presentationId } = useParams<{ id: string }>();
  const { data: slides } = useSlides(presentationId);
  const createSlide = useCreateSlide();
  const updateSlide = useUpdateSlide();
  const createPresentation = useCreatePresentation();
  const navigate = useNavigate();
  const memoriesMap = useArcMemoriesMap();
  const saveMemory = useSaveArcMemory();

  useEffect(() => {
    if (presentationId) setActivePresentationId(presentationId);
  }, [presentationId]);

  const toggleChat = useCallback(() => setIsOpen((p) => !p), []);
  const openCommand = useCallback(() => setIsCommandOpen(true), []);
  const closeCommand = useCallback(() => setIsCommandOpen(false), []);
  const resetConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
  }, []);
  
  const loadConversation = useCallback((id: string, msgs: Message[], m: ArcMode) => {
    setCurrentConversationId(id);
    setMessages(msgs);
    setMode(m);
    setIsOpen(true);
  }, []);

  const saveCurrentConversation = useCallback(async () => {
    if (messages.length === 0) return;
    const { useSaveArcConversation } = await import("@/hooks/useArcConversations");
    // We can't use hooks here, so use supabase directly
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg?.content.slice(0, 60) || "New Conversation";
    
    if (currentConversationId) {
      await supabase
        .from("arc_conversations")
        .update({ messages: JSON.parse(JSON.stringify(messages)), mode, title })
        .eq("id", currentConversationId);
    } else {
      const { data } = await supabase
        .from("arc_conversations")
        .insert({ user_id: user.id, title, messages: JSON.parse(JSON.stringify(messages)), mode })
        .select("id")
        .single();
      if (data) setCurrentConversationId(data.id);
    }
  }, [messages, mode, currentConversationId]);

  // Parse and save arc-memory blocks
  const parseAndSaveMemories = useCallback(async (content: string) => {
    const memoryRegex = /```arc-memory\s*([\s\S]*?)```/g;
    let match;
    while ((match = memoryRegex.exec(content)) !== null) {
      try {
        const mem = JSON.parse(match[1]);
        if (mem.key && mem.value) {
          await saveMemory.mutateAsync({ key: mem.key, value: mem.value });
        }
      } catch (e) {
        console.error("Failed to parse arc-memory:", e);
      }
    }
  }, [saveMemory]);

  // Parse and handle arc-image blocks
  const parseAndGenerateImages = useCallback(async (content: string) => {
    const imageRegex = /```arc-image\s*([\s\S]*?)```/g;
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      try {
        const imgData = JSON.parse(match[1]);
        if (!imgData.prompt) continue;

      const targetSlideIndex = imgData.slideIndex ?? 0;
        
        // Use newly created slide IDs if available, fallback to existing slides
        const newIds = newSlideIdsRef.current;
        const existingSlides = slides || [];
        const targetSlideId = (newIds.length > 0 && newIds[targetSlideIndex])
          ? newIds[targetSlideIndex]
          : existingSlides[targetSlideIndex]?.id ?? existingSlides[0]?.id;
        
        if (!targetSlideId) {
          console.warn(`arc-image: No slide at index ${targetSlideIndex}`);
          continue;
        }

        const session = await supabase.auth.getSession();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-slide-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ prompt: imgData.prompt, slideId: targetSlideId }),
        });

        if (resp.ok) {
          const { imageUrl } = await resp.json();
          // Fetch the current slide content from DB since state may be stale
          const { data: slideData } = await supabase.from("slides").select("content").eq("id", targetSlideId).single();
          const slideContent = typeof slideData?.content === "object" && slideData?.content !== null
            ? slideData.content as Record<string, unknown>
            : {};
          updateSlide.mutate({
            id: targetSlideId,
            content: { ...slideContent, imageUrl } as Json,
          });
          toast.success(`Image generated for slide ${targetSlideIndex + 1}`);
        } else if (resp.status === 429) {
          toast.error("Rate limited — try again later");
        } else if (resp.status === 402) {
          toast.error("Credits exhausted — please add funds");
        }
      } catch (e) {
        console.error("Failed to generate arc-image:", e);
      }
    }
  }, [slides, updateSlide]);

  // Repair slide content to ensure no empty fields
  const repairSlideContent = useCallback((slide: any) => {
    // Normalize slide_type → block_type (Arc AI sometimes uses slide_type)
    if (!slide.block_type && slide.slide_type) {
      slide.block_type = slide.slide_type;
    }
    const c = slide.content || {};
    if (!c.layout) c.layout = "center";
    switch (slide.block_type) {
      case "title":
        if (!c.heading) c.heading = "Untitled Slide";
        if (!c.subheading) c.subheading = "";
        break;
      case "story":
        if (!c.heading) c.heading = "Key Point";
        if (!c.body) c.body = "Details to be added.";
        break;
      case "data":
        if (!c.heading) c.heading = "Key Metric";
        if (!c.metric) c.metric = "—";
        if (!c.description) c.description = "";
        break;
      case "cta":
        if (!c.heading) c.heading = "Next Steps";
        if (!c.body) c.body = "Let's connect.";
        if (!c.buttonText) c.buttonText = "Get Started";
        break;
      case "framework":
        if (!c.heading) c.heading = "Framework";
        // Arc AI sometimes uses "items" instead of "steps"
        if (Array.isArray(c.items) && !c.steps) c.steps = c.items;
        if (!Array.isArray(c.steps) || c.steps.length === 0) c.steps = ["Step 1", "Step 2", "Step 3"];
        c.layout = "columns";
        break;
      case "comparison":
        if (!c.heading) c.heading = "Comparison";
        if (!c.left) c.left = { title: "Option A", points: ["Point 1"] };
        if (!c.right) c.right = { title: "Option B", points: ["Point 1"] };
        c.layout = "split";
        break;
      case "quote":
        if (!c.quote) c.quote = "—";
        if (!c.attribution) c.attribution = "";
        break;
      case "testimonial":
        if (!c.quote) c.quote = "—";
        if (!c.name) c.name = "";
        break;
      case "gif":
        if (!c.heading) c.heading = "Visual Demo";
        if (!c.gifUrl) c.gifUrl = "";
        if (!c.caption) c.caption = "";
        break;
      case "lottie":
        if (!c.heading) c.heading = "Animation";
        if (!c.lottieUrl) c.lottieUrl = "";
        if (!c.caption) c.caption = "";
        if (c.loop === undefined) c.loop = true;
        break;
      case "quiz":
        if (!c.heading) c.heading = "Quick Check";
        if (!c.question) c.question = "What did you learn?";
        if (!Array.isArray(c.choices) || c.choices.length < 2) c.choices = ["Option A", "Option B", "Option C"];
        if (c.correctIndex === undefined) c.correctIndex = 0;
        if (!c.explanation) c.explanation = "";
        break;
      case "lesson-objective":
        if (!c.heading) c.heading = "Learning Objectives";
        if (!Array.isArray(c.objectives) || c.objectives.length === 0) c.objectives = ["Understand the key concepts"];
        break;
      case "key-takeaway":
        if (!c.heading) c.heading = "Key Takeaway";
        if (!c.body) c.body = "Remember this important point.";
        break;
      case "activity":
        if (!c.heading) c.heading = "Activity";
        if (!c.body) c.body = "Complete this exercise.";
        if (!c.duration) c.duration = "5 min";
        if (!c.activityType) c.activityType = "individual";
        break;
      case "progress-checkpoint":
        if (!c.heading) c.heading = "Progress Check";
        if (c.progressPercent === undefined) c.progressPercent = 50;
        if (!Array.isArray(c.completed)) c.completed = [];
        if (!c.current) c.current = "";
        if (!Array.isArray(c.upcoming)) c.upcoming = [];
        break;
    }
    return { ...slide, content: c };
  }, []);

  // Store newly created slide IDs for arc-image referencing
  const newSlideIdsRef = useRef<string[]>([]);

  // Parse slides-json blocks from Arc's response and create slides
  const parseAndCreateSlides = useCallback(async (content: string) => {
    const match = content.match(/```slides-json\s*([\s\S]*?)```/);
    if (!match) return;

    // Parse theme selection
    const themeMatch = content.match(/```arc-theme\s*([\s\S]*?)```/);
    let selectedTheme = PRESET_THEMES[0]; // default
    if (themeMatch) {
      try {
        const { theme_id } = JSON.parse(themeMatch[1]);
        const found = PRESET_THEMES.find(t => t.id === theme_id);
        if (found) selectedTheme = found;
      } catch { /* use default */ }
    }

    try {
      const slidesData = JSON.parse(match[1]);
      if (!Array.isArray(slidesData)) return;

      let targetPresentationId = presentationId;

      if (!targetPresentationId) {
        const titleSlide = slidesData.find((s: any) => s.block_type === "title");
        const title = titleSlide?.content?.heading || "Arc-Generated Presentation";
        const pres = await createPresentation.mutateAsync({ title });
        targetPresentationId = pres.id;
      }

      // Apply theme to the presentation
      await supabase
        .from("presentations")
        .update({ theme: themeToJson(selectedTheme) })
        .eq("id", targetPresentationId);

      // If this presentation already has slides, REPLACE them instead of appending
      const existingSlides = slides || [];
      if (existingSlides.length > 0 && presentationId) {
        toast.info("Replacing existing slides…");
        // Delete all old slides
        const oldIds = existingSlides.map(s => s.id);
        for (const oldId of oldIds) {
          await supabase.from("slides").delete().eq("id", oldId);
        }
      } else {
        toast.info("Building your slides…");
      }

      const createdIds: string[] = [];
      for (let i = 0; i < slidesData.length; i++) {
        const repairedSlide = repairSlideContent(slidesData[i]);
        const speakerScript = repairedSlide.content?.speaker_script || repairedSlide.content?.script || null;
        const created = await createSlide.mutateAsync({
          presentation_id: targetPresentationId,
          block_type: repairedSlide.block_type || "title",
          content: repairedSlide.content as Json,
          sort_order: i,
          notes: speakerScript ? String(speakerScript) : null,
        });
        if (created?.id) createdIds.push(created.id);
      }
      newSlideIdsRef.current = createdIds;

      toast.success(`${slidesData.length} slides created!`);
      if (!presentationId && targetPresentationId) {
        navigate(`/editor/${targetPresentationId}`);
      }
    } catch (e) {
      console.error("Failed to parse slides JSON:", e);
    }
  }, [presentationId, slides, createSlide, createPresentation, navigate, repairSlideContent]);

  const sendMessage = useCallback(async (input: string, attachedPresentationId?: string) => {
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setIsOpen(true);
    setIsCommandOpen(false);

    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arc-chat`;

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const allMessages = [...messages, userMsg];

      // Get slides context from either the current editor or attached presentation
      let slidesContext: Array<{ block_type: string; content: any }> | undefined;
      if (attachedPresentationId) {
        const { data: attachedSlides } = await supabase
          .from("slides")
          .select("block_type, content")
          .eq("presentation_id", attachedPresentationId)
          .order("sort_order");
        if (attachedSlides?.length) {
          slidesContext = attachedSlides.map((s) => ({ block_type: s.block_type, content: s.content }));
        }
      } else if ((mode === "chat" || mode === "coaching" || mode === "rewrite" || mode === "quick") && slides) {
        slidesContext = slides.map((s) => ({ block_type: s.block_type, content: s.content }));
      }

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        upsertAssistant("Please sign in to use Arc.");
        setIsLoading(false);
        return;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: allMessages,
          mode,
          slides_context: slidesContext,
          user_memories: memoriesMap,
          teaching_style: typeof window !== "undefined" ? localStorage.getItem("presentq_teaching_style") : null,
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          upsertAssistant("I'm getting a lot of requests right now. Give me a moment and try again.");
          setIsLoading(false);
          return;
        }
        if (resp.status === 402) {
          upsertAssistant("Looks like we've hit the usage limit. Please add credits to continue.");
          setIsLoading(false);
          return;
        }
        throw new Error("Stream failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }

      // After streaming completes, process special blocks
      if (assistantSoFar.includes("```slides-json")) {
        await parseAndCreateSlides(assistantSoFar);
      }
      if (assistantSoFar.includes("```arc-memory")) {
        await parseAndSaveMemories(assistantSoFar);
      }
      if (assistantSoFar.includes("```arc-image")) {
        await parseAndGenerateImages(assistantSoFar);
      }
      // Inline image generation for chat — arc-generate-image blocks
      if (assistantSoFar.includes("```arc-generate-image")) {
        const imgRegex = /```arc-generate-image\s*([\s\S]*?)```/g;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(assistantSoFar)) !== null) {
          try {
            const imgData = JSON.parse(imgMatch[1]);
            if (!imgData.prompt) continue;
            
            const session = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arc-generate-image`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session.data.session?.access_token}`,
              },
              body: JSON.stringify({ prompt: imgData.prompt }),
            });

            if (resp.ok) {
              const { imageUrl } = await resp.json();
              // Replace the arc-generate-image block with an arc-chat-image block containing the URL
              const replacement = `\`\`\`arc-chat-image\n${JSON.stringify({ url: imageUrl })}\n\`\`\``;
              assistantSoFar = assistantSoFar.replace(imgMatch[0], replacement);
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return prev;
              });
              toast.success("Image generated!");
            } else if (resp.status === 429) {
              toast.error("Rate limited — try again later");
            } else if (resp.status === 402) {
              toast.error("Credits exhausted — please add funds");
            }
          } catch (e) {
            console.error("Failed to generate chat image:", e);
          }
        }
      }
      // Teleprompter script extraction
      if (assistantSoFar.includes("```teleprompter-script")) {
        const tpMatch = assistantSoFar.match(/```teleprompter-script\s*([\s\S]*?)```/);
        if (tpMatch && teleprompterCallbackRef.current) {
          teleprompterCallbackRef.current(tpMatch[1].trim());
          toast.success("Script loaded into teleprompter!");
        }
      }
    } catch (e) {
      console.error("Arc chat error:", e);
      upsertAssistant("Something went wrong. Let's try that again.");
    } finally {
      setIsLoading(false);
    }
  }, [messages, mode, slides, memoriesMap, parseAndCreateSlides, parseAndSaveMemories, parseAndGenerateImages]);

  return (
    <ArcContext.Provider value={{
      messages, isOpen, isCommandOpen, isLoading, mode, currentConversationId,
      activePresentationId,
      teleprompterCallbackRef,
      setActivePresentationId,
      setMode, toggleChat, openCommand, closeCommand, sendMessage, resetConversation,
      loadConversation, saveCurrentConversation,
    }}>
      {children}
    </ArcContext.Provider>
  );
}
