import { ReactNode, Suspense, lazy, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import type { Json } from "@/integrations/supabase/types";
import type { SlideTheme } from "@/lib/slideThemes";
import { themeToCSS } from "@/lib/slideThemes";
import SlideOverlayLayer, { type SlideOverlay } from "@/components/editor/SlideOverlayLayer";

const LottiePlayer = lazy(() => import("lottie-react").then(m => ({ default: m.default })));

interface ElementAnimation {
  type?: "none" | "fade-in" | "slide-up" | "slide-left" | "slide-right" | "scale" | "blur-in";
  delay?: number;
  duration?: number;
  easing?: string;
}

interface SlideContent {
  heading?: string;
  subheading?: string;
  body?: string;
  quote?: string;
  attribution?: string;
  metric?: string;
  description?: string;
  buttonText?: string;
  steps?: string[];
  left?: { title: string; points: string[] };
  right?: { title: string; points: string[] };
  name?: string;
  role?: string;
  layout?: string;
  points?: string[];
  imageUrl?: string;
  videoUrl?: string;
  gifUrl?: string;
  caption?: string;
  lottieUrl?: string;
  lottieLoop?: boolean;
  chartData?: { label: string; value: number }[];
  chartType?: "bar" | "line" | "pie" | "donut";
  tableHeaders?: string[];
  tableRows?: string[][];
  contentAnimation?: "none" | "fade-in" | "stagger";
  slideDuration?: number;
  audioUrl?: string;
  audioAutoplay?: boolean;
  // Per-element animation overrides
  headingAnimation?: ElementAnimation;
  bodyAnimation?: ElementAnimation;
  imageAnimation?: ElementAnimation;
  // ─── Educational block fields ───
  question?: string;
  questionType?: "multiple-choice" | "true-false" | "open-ended";
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  objectives?: string[];
  icon?: string;
  takeaway?: string;
  instructions?: string;
  duration?: string;
  activityType?: "individual" | "group" | "discussion";
  completedModules?: string[];
  currentModule?: string;
  upcomingModules?: string[];
  progressPercent?: number;
  // ─── New educational block fields ───
  definition?: string;
  analogy?: string;
  example?: string;
  prompts?: string[];
  reference?: string;
  passage?: string;
  commentary?: string;
  reflectionQuestions?: string[];
  keyPoints?: string[];
  actionItems?: string[];
  closingThought?: string;
  // ─── Overlay positioning ───
  overlays?: SlideOverlay[];
}

function parseContent(content: Json): SlideContent {
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    return content as unknown as SlideContent;
  }
  return {};
}

// Per-element animation variants
const animationVariants: Record<string, { initial: any; animate: any }> = {
  "none": { initial: {}, animate: {} },
  "fade-in": { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } },
  "slide-up": { initial: { opacity: 0, y: 60 }, animate: { opacity: 1, y: 0 } },
  "slide-left": { initial: { opacity: 0, x: -60 }, animate: { opacity: 1, x: 0 } },
  "slide-right": { initial: { opacity: 0, x: 60 }, animate: { opacity: 1, x: 0 } },
  "scale": { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 } },
  "blur-in": { initial: { opacity: 0, filter: "blur(10px)" }, animate: { opacity: 1, filter: "blur(0px)" } },
};

// Animated wrapper for slide elements — supports per-element overrides
function AnimEl({ children, index, animation, isPresenting, elementAnim, morphId }: {
  children: ReactNode;
  index: number;
  animation?: string;
  isPresenting?: boolean;
  elementAnim?: ElementAnimation;
  morphId?: string;
}) {
  // Per-element animation takes priority
  if (isPresenting && elementAnim && elementAnim.type && elementAnim.type !== "none") {
    const variant = animationVariants[elementAnim.type] || animationVariants["fade-in"];
    return (
      <motion.div
        layoutId={morphId}
        initial={variant.initial}
        animate={variant.animate}
        transition={{
          duration: elementAnim.duration || 0.6,
          delay: elementAnim.delay || 0.1,
          ease: (elementAnim.easing as any) || "easeOut",
        }}
      >
        {children}
      </motion.div>
    );
  }

  // Morph layoutId support even without animation
  if (morphId) {
    if (!isPresenting || !animation || animation === "none") {
      return <motion.div layoutId={morphId}>{children}</motion.div>;
    }
  }

  if (!isPresenting || !animation || animation === "none") return <>{children}</>;
  if (animation === "fade-in") {
    return (
      <motion.div layoutId={morphId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
        {children}
      </motion.div>
    );
  }
  // stagger
  return (
    <motion.div layoutId={morphId} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 * index + 0.1 }}>
      {children}
    </motion.div>
  );
}

function toStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val == null) return "";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try { return JSON.stringify(val); } catch { return ""; }
}

function Md({ children }: { children?: unknown }) {
  const text = toStr(children);
  if (!text) return null;
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <span>{children}</span>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-8 space-y-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-8 space-y-2">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => (
          <a href={href} style={{ color: "var(--slide-primary)", textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">{children}</a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function SlideImage({ src }: { src?: string }) {
  const [error, setError] = useState(false);
  if (!src) return null;
  if (error) return null;
  return (
    <div className="w-full flex justify-center my-8">
      <img src={src} alt="" className="max-h-[500px] max-w-full rounded-2xl object-contain shadow-lg" onError={() => setError(true)} />
    </div>
  );
}

/** Check if a URL looks like a direct image/gif file */
function isDirectMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    // Direct file extensions
    if (/\.(gif|png|jpg|jpeg|webp|svg|avif|bmp)$/i.test(path)) return true;
    // Known CDN patterns that serve direct media
    if (u.hostname.includes("giphy.com")) return true;
    if (u.hostname.includes("tenor.com")) return true;
    if (u.hostname.includes("imgur.com")) return true;
    if (u.hostname.includes("unsplash.com")) return true;
    if (u.hostname.includes("pexels.com")) return true;
    // Generic CDN / storage patterns
    if (path.includes("/media/") || path.includes("/assets/")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Check if a URL is a page URL (Tenor/Giphy view pages) that should be embedded as iframe */
function isGifPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.includes("tenor.com") && u.pathname.includes("/view/")) return true;
    if (u.hostname.includes("giphy.com") && u.pathname.includes("/gifs/")) return true;
  } catch { /* ignore */ }
  return false;
}

/** Convert a Tenor/Giphy page URL to an embeddable media URL */
function resolveGifUrl(url: string): string {
  try {
    const u = new URL(url);
    // Giphy page URLs → convert to media (reliable pattern)
    if (u.hostname.includes("giphy.com") && u.pathname.includes("/gifs/")) {
      const slug = u.pathname.split("/gifs/")[1]?.replace(/\/$/, "");
      if (slug) {
        const idMatch = slug.match(/([a-zA-Z0-9]+)$/);
        if (idMatch) {
          return `https://media.giphy.com/media/${idMatch[1]}/giphy.gif`;
        }
      }
    }
  } catch { /* fall through */ }
  return url;
}

function SlideGif({ src, caption, fallbackImageUrl }: { src?: string; caption?: string; fallbackImageUrl?: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading");
  if (!src) return null;

  // Tenor page URLs can't be resolved to direct GIFs without API — embed as iframe
  if (isGifPageUrl(src)) {
    const resolved = resolveGifUrl(src);
    if (resolved !== src) {
      return (
        <div className="w-full flex flex-col items-center my-8">
          <img src={resolved} alt={caption || "Animation"} className="max-h-[600px] max-w-full rounded-2xl object-contain" onError={() => {}} />
          {caption && <p className="text-[24px] mt-4 text-center opacity-60">{caption}</p>}
        </div>
      );
    }
    return (
      <div className="w-full flex flex-col items-center my-8">
        <div className="w-[500px] h-[400px] rounded-2xl overflow-hidden">
          <iframe src={src} title={caption || "GIF"} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" />
        </div>
        {caption && caption !== src && <p className="text-[24px] mt-4 text-center opacity-60">{caption}</p>}
      </div>
    );
  }

  const isDirectMedia = isDirectMediaUrl(src);

  // Show fallback if: not a direct media URL, OR the image failed/loaded as a broken placeholder
  if (!isDirectMedia || status === "failed") {
    if (fallbackImageUrl) {
      return (
        <div className="w-full flex flex-col items-center my-8">
          <img src={fallbackImageUrl} alt={caption || "Visual"} className="max-h-[600px] max-w-full rounded-2xl object-contain shadow-lg" />
          {caption && <p className="text-[24px] mt-4 text-center opacity-60">{caption}</p>}
        </div>
      );
    }
    return (
      <div className="w-full flex flex-col items-center my-8">
        <div className="w-[400px] h-[300px] rounded-2xl bg-secondary/50 border border-border/30 flex flex-col items-center justify-center gap-3">
          <div className="text-[48px] opacity-20">🎬</div>
          <p className="text-[24px] opacity-40">{caption || "Visual placeholder"}</p>
        </div>
      </div>
    );
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Giphy/Tenor "not available" placeholders are typically very small (< 500px wide)
    // Real GIFs are larger. If the natural size is tiny, treat as broken.
    if (img.naturalWidth < 200 || img.naturalHeight < 150) {
      setStatus("failed");
    } else {
      setStatus("ok");
    }
  };

  return (
    <div className="w-full flex flex-col items-center my-8">
      {/* Show GIF attempt; on error or tiny load, swap to fallback */}
      {status === "loading" && fallbackImageUrl && (
        <img src={fallbackImageUrl} alt={caption || "Visual"} className="max-h-[600px] max-w-full rounded-2xl object-contain shadow-lg absolute opacity-50" />
      )}
      <img
        src={src}
        alt={caption || "Animation"}
        className={`max-h-[600px] max-w-full rounded-2xl object-contain ${status === "loading" ? "opacity-0 absolute" : ""}`}
        onError={() => setStatus("failed")}
        onLoad={handleLoad}
      />
      {caption && <p className="text-[24px] mt-4 text-center opacity-60">{caption}</p>}
    </div>
  );
}

function SlideLottie({ url, loop = true }: { url?: string; loop?: boolean }) {
  if (!url) return null;
  return (
    <Suspense fallback={<div className="w-[500px] h-[500px] flex items-center justify-center text-[28px] opacity-40">Loading animation...</div>}>
      <LottiePlayerWrapper url={url} loop={loop} />
    </Suspense>
  );
}

/** Check if URL looks like a valid Lottie JSON endpoint */
function isLottieUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".json") || path.endsWith(".lottie")) return true;
    if (u.hostname.includes("lottiefiles.com")) return true;
    if (u.hostname.includes("assets") && path.includes("lottie")) return true;
    return false;
  } catch {
    return false;
  }
}

function LottiePlayerWrapper({ url, loop }: { url: string; loop: boolean }) {
  const [animData, setAnimData] = useState<object | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;

    if (!isLottieUrl(url)) {
      setError(true);
      return;
    }

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data && (data.v !== undefined || data.animations || data.layers)) {
          setAnimData(data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, [url]);

  if (error) return (
    <div className="w-[500px] h-[500px] flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed" style={{ borderColor: "var(--slide-muted, hsl(var(--muted-foreground)))" }}>
      <p className="text-[28px] opacity-60" style={{ color: "var(--slide-muted)" }}>Animation unavailable</p>
      <p className="text-[20px] opacity-40" style={{ color: "var(--slide-muted)" }}>Falling back to image if available</p>
    </div>
  );
  if (!animData) return <div className="w-[500px] h-[500px] flex items-center justify-center text-[28px] opacity-40">Loading...</div>;

  return <LottiePlayer animationData={animData} loop={loop} style={{ width: 500, height: 500 }} />;
}


interface SlideRendererProps {
  blockType: string;
  content: Json;
  theme?: SlideTheme;
  isPresenting?: boolean;
  slideId?: string;
  editable?: boolean;
  onOverlaysChange?: (overlays: SlideOverlay[]) => void;
}

export default function SlideRenderer({ blockType, content, theme, isPresenting, slideId, editable, onOverlaysChange }: SlideRendererProps) {
  const c = parseContent(content);
  const overlays = c.overlays || [];
  const slideContent = <SlideRendererInner blockType={blockType} content={content} theme={theme} isPresenting={isPresenting} slideId={slideId} />;

  if (overlays.length === 0 && !editable) return slideContent;

  return (
    <div className="relative w-full h-full">
      {slideContent}
      <SlideOverlayLayer
        overlays={overlays}
        editable={editable}
        onUpdate={onOverlaysChange}
      />
    </div>
  );
}

function SlideRendererInner({ blockType, content, theme, isPresenting, slideId }: { blockType: string; content: Json; theme?: SlideTheme; isPresenting?: boolean; slideId?: string }) {
  const c = parseContent(content);
  const anim = c.contentAnimation || "none";
  const themeStyle = theme ? themeToCSS(theme) : {};
  const bg = theme ? { background: "var(--slide-bg-gradient, var(--slide-bg))" } : {};
  const fg = theme ? { color: "var(--slide-fg)" } : {};
  const mutedColor = theme ? { color: "var(--slide-muted)" } : {};
  const primaryColor = theme ? { color: "var(--slide-primary)" } : {};
  const secondaryBg = theme ? { backgroundColor: "var(--slide-secondary)" } : {};
  const primaryBg = theme ? { backgroundColor: "var(--slide-primary)", color: "var(--slide-bg)" } : {};
  const headingFont = theme ? { fontFamily: "var(--slide-heading-font)" } : {};
  const bodyFont = theme ? { fontFamily: "var(--slide-body-font)" } : {};

  // Morph ID prefix for layoutId
  const mid = slideId ? `morph-${slideId}` : undefined;
  const morphId = (suffix: string) => mid ? `${mid}-${suffix}` : undefined;

  const wrapStyle = { ...themeStyle };

  switch (blockType) {
    case "title":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h1 className={`text-[96px] font-bold text-center leading-tight ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading || "Untitled"}</Md>
            </h1>
          </AnimEl>
          {c.subheading && (
            <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("sub")}>
              <p className={`text-[40px] mt-8 text-center ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
                <Md>{c.subheading}</Md>
              </p>
            </AnimEl>
          )}
          <AnimEl index={2} animation={anim} isPresenting={isPresenting} elementAnim={c.imageAnimation} morphId={morphId("img")}>
            <SlideImage src={c.imageUrl} />
          </AnimEl>
        </div>
      );

    case "story":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h2 className={`text-[72px] font-bold leading-tight mb-12 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading || "Story"}</Md>
            </h2>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("body")}>
            <div className={`text-[36px] leading-relaxed max-w-[1400px] ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
              <Md>{c.body || "Your story goes here..."}</Md>
            </div>
          </AnimEl>
          <AnimEl index={2} animation={anim} isPresenting={isPresenting} elementAnim={c.imageAnimation} morphId={morphId("img")}>
            <SlideImage src={c.imageUrl} />
          </AnimEl>
        </div>
      );

    case "framework":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <h2 className={`text-[72px] font-bold mb-16 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
            <Md>{c.heading || "Framework"}</Md>
          </h2>
          <div className="flex gap-12">
            {(c.steps || ["Step 1", "Step 2", "Step 3"]).map((step, i) => {
              const stepTitle = typeof step === "object" && step !== null ? (step as any).title || "" : "";
              const stepDesc = typeof step === "object" && step !== null ? (step as any).description || "" : String(step);
              return (
                <div key={i} className="flex-1 p-10 rounded-3xl border border-border/30" style={secondaryBg}>
                  <div className={`text-[48px] font-bold mb-4 ${!theme ? "font-display text-primary" : ""}`} style={{ ...primaryColor, ...headingFont }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  {stepTitle && (
                    <div className={`text-[36px] font-semibold mb-2 ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>{stepTitle}</div>
                  )}
                  <div className={`text-[32px] ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}><Md>{stepDesc}</Md></div>
                </div>
              );
            })}
          </div>
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "data":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h2 className={`text-[48px] font-semibold mb-8 ${!theme ? "font-display text-muted-foreground" : ""}`} style={{ ...mutedColor, ...headingFont }}>
              <Md>{c.heading || "The Numbers"}</Md>
            </h2>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("metric")}>
            <div className={`text-[160px] font-bold leading-none ${!theme ? "font-display text-primary" : ""}`} style={{ ...primaryColor, ...headingFont }}>
              {c.metric || "100%"}
            </div>
          </AnimEl>
          <AnimEl index={2} animation={anim} isPresenting={isPresenting} morphId={morphId("desc")}>
            <div className={`text-[36px] mt-8 max-w-[1000px] text-center ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
              <Md>{c.description || "Description"}</Md>
            </div>
          </AnimEl>
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "cta":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h2 className={`text-[80px] font-bold text-center leading-tight mb-8 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading || "Call to Action"}</Md>
            </h2>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("body")}>
            <div className={`text-[36px] mb-12 text-center max-w-[1200px] ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
              <Md>{c.body || "Take the next step."}</Md>
            </div>
          </AnimEl>
          <AnimEl index={2} animation={anim} isPresenting={isPresenting} morphId={morphId("btn")}>
            <div className="px-16 py-6 rounded-2xl text-[32px] font-semibold" style={{ ...primaryBg, ...headingFont }}>
              {c.buttonText || "Get Started"}
            </div>
          </AnimEl>
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "quote":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <div className="text-[120px] leading-none font-serif" style={primaryColor}>"</div>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("quote")}>
            <div className={`text-[48px] text-center leading-relaxed max-w-[1400px] -mt-8 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.quote || "Your quote here"}</Md>
            </div>
          </AnimEl>
          {c.attribution && <p className="text-[28px] mt-10" style={mutedColor}>— {c.attribution}</p>}
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "comparison":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <h2 className={`text-[72px] font-bold mb-16 text-center ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
            <Md>{c.heading || "Comparison"}</Md>
          </h2>
          <div className="flex gap-12">
            {[c.left || { title: "Before", points: [] }, c.right || { title: "After", points: [] }].map((side, i) => (
              <div key={i} className="flex-1 p-12 rounded-3xl border border-border/30" style={secondaryBg}>
                <h3 className={`text-[40px] font-bold mb-8 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>{side.title}</h3>
                {side.points?.map((pt, j) => (
                  <div key={j} className="text-[28px] mb-4" style={{ ...mutedColor, ...bodyFont }}>• <Md>{pt}</Md></div>
                ))}
              </div>
            ))}
          </div>
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "bio":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} morphId={morphId("label")}>
            <h2 className={`text-[48px] font-semibold mb-4 ${!theme ? "font-display text-muted-foreground" : ""}`} style={{ ...mutedColor, ...headingFont }}>
              <Md>{c.heading || "About"}</Md>
            </h2>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("name")}>
            <div className={`text-[72px] font-bold text-center ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              {c.name || "Name"}
            </div>
          </AnimEl>
          <AnimEl index={2} animation={anim} isPresenting={isPresenting} morphId={morphId("role")}>
            <p className={`text-[36px] mt-2 ${!theme ? "text-primary" : ""}`} style={{ ...primaryColor, ...bodyFont }}>
              {c.role || "Role"}
            </p>
          </AnimEl>
          <AnimEl index={3} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("bio")}>
            <div className={`text-[32px] mt-8 text-center max-w-[1200px] leading-relaxed ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
              <Md>{c.body || "Bio description"}</Md>
            </div>
          </AnimEl>
          <AnimEl index={4} animation={anim} isPresenting={isPresenting} elementAnim={c.imageAnimation} morphId={morphId("img")}>
            <SlideImage src={c.imageUrl} />
          </AnimEl>
        </div>
      );

    case "testimonial":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <div className="text-[100px] leading-none font-serif" style={primaryColor}>"</div>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("quote")}>
            <div className={`text-[44px] text-center leading-relaxed max-w-[1400px] -mt-4 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.quote || "Testimonial"}</Md>
            </div>
          </AnimEl>
          <div className="mt-12 text-center">
            <p className={`text-[32px] font-semibold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>{c.name || "Name"}</p>
            <p className="text-[24px]" style={{ ...mutedColor, ...bodyFont }}>{c.role || "Role"}</p>
          </div>
          <SlideImage src={c.imageUrl} />
        </div>
      );

    case "video":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          {c.heading && (
            <h2 className={`text-[60px] font-bold mb-12 text-center ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading}</Md>
            </h2>
          )}
          {c.videoUrl ? (
            <div className="w-full max-w-[1400px] aspect-video rounded-2xl overflow-hidden shadow-lg">
              <iframe
                src={convertToEmbed(c.videoUrl) + (isPresenting ? (convertToEmbed(c.videoUrl).includes("?") ? "&autoplay=1" : "?autoplay=1") : "")}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="w-full max-w-[1400px] aspect-video rounded-2xl border-4 border-dashed flex items-center justify-center" style={{ borderColor: "var(--slide-muted, hsl(var(--muted-foreground)))" }}>
              <p className="text-[36px]" style={mutedColor}>Paste a YouTube, Vimeo, or Loom URL</p>
            </div>
          )}
        </div>
      );

    /* ─── GIF Block ─── */
    case "gif":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          {c.heading && (
            <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
              <h2 className={`text-[60px] font-bold mb-12 text-center ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading}</Md>
              </h2>
            </AnimEl>
          )}
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.imageAnimation} morphId={morphId("gif")}>
            {c.gifUrl ? (
              <SlideGif src={c.gifUrl} caption={c.caption} fallbackImageUrl={c.imageUrl} />
            ) : (
              <div className="w-full max-w-[800px] aspect-video rounded-2xl border-4 border-dashed flex flex-col items-center justify-center gap-4" style={{ borderColor: "var(--slide-muted, hsl(var(--muted-foreground)))" }}>
                <p className="text-[36px]" style={mutedColor}>Paste a GIF URL</p>
                <p className="text-[24px] opacity-60" style={mutedColor}>GIPHY, Tenor, or any direct .gif link</p>
              </div>
            )}
          </AnimEl>
        </div>
      );

    /* ─── Lottie Block ─── */
    case "lottie":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          {c.heading && (
            <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
              <h2 className={`text-[60px] font-bold mb-12 text-center ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading}</Md>
              </h2>
            </AnimEl>
          )}
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.imageAnimation} morphId={morphId("lottie")}>
            {c.lottieUrl ? (
              <SlideLottie url={c.lottieUrl} loop={c.lottieLoop !== false} />
            ) : (
              <div className="w-full max-w-[800px] aspect-square max-h-[500px] rounded-2xl border-4 border-dashed flex flex-col items-center justify-center gap-4" style={{ borderColor: "var(--slide-muted, hsl(var(--muted-foreground)))" }}>
                <p className="text-[36px]" style={mutedColor}>Paste a Lottie JSON URL</p>
                <p className="text-[24px] opacity-60" style={mutedColor}>From LottieFiles or any .json endpoint</p>
              </div>
            )}
          </AnimEl>
          {c.caption && (
            <p className="text-[24px] mt-6 text-center opacity-60" style={{ ...mutedColor, ...bodyFont }}>{c.caption}</p>
          )}
        </div>
      );

    case "chart": {
      const chartType = c.chartType || "bar";
      const data = c.chartData || [];
      const total = data.reduce((s, d) => s + d.value, 0) || 1;
      const maxVal = Math.max(...data.map(d => d.value), 1);
      const COLORS = ["var(--slide-primary, hsl(var(--primary)))", "#22d3ee", "#f97316", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#818cf8"];

      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <h2 className={`text-[72px] font-bold mb-16 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
            <Md>{c.heading || "Chart"}</Md>
          </h2>
          {data.length > 0 ? (
            <>
              {/* Bar chart */}
              {chartType === "bar" && (
                <div className="flex items-end gap-8 h-[500px]">
                  {data.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="text-[28px] font-bold mb-2" style={primaryColor}>{d.value}</div>
                      <div className="w-full rounded-t-xl transition-all" style={{ height: `${(d.value / maxVal) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      <div className="text-[24px] mt-4 text-center" style={{ ...mutedColor, ...bodyFont }}>{d.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Line chart */}
              {chartType === "line" && (
                <div className="relative h-[500px] w-full">
                  <svg viewBox={`0 0 ${data.length * 200} 500`} className="w-full h-full" preserveAspectRatio="none">
                    {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
                      <line key={i} x1="0" y1={500 - r * 450 - 25} x2={data.length * 200} y2={500 - r * 450 - 25} stroke="var(--slide-muted, hsl(var(--muted-foreground)))" strokeWidth="1" opacity="0.2" />
                    ))}
                    <polyline
                      fill="none"
                      stroke="var(--slide-primary, hsl(var(--primary)))"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={data.map((d, i) => `${i * 200 + 100},${500 - (d.value / maxVal) * 450 - 25}`).join(" ")}
                    />
                    <polygon
                      fill="var(--slide-primary, hsl(var(--primary)))"
                      opacity="0.1"
                      points={`${100},${475} ${data.map((d, i) => `${i * 200 + 100},${500 - (d.value / maxVal) * 450 - 25}`).join(" ")} ${(data.length - 1) * 200 + 100},${475}`}
                    />
                    {data.map((d, i) => (
                      <g key={i}>
                        <circle cx={i * 200 + 100} cy={500 - (d.value / maxVal) * 450 - 25} r="12" fill="var(--slide-primary, hsl(var(--primary)))" />
                        <text x={i * 200 + 100} y={500 - (d.value / maxVal) * 450 - 50} textAnchor="middle" fill="var(--slide-primary, hsl(var(--primary)))" fontSize="28" fontWeight="bold">{d.value}</text>
                        <text x={i * 200 + 100} y={498} textAnchor="middle" fill="var(--slide-muted, hsl(var(--muted-foreground)))" fontSize="24">{d.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}

              {/* Pie / Donut chart */}
              {(chartType === "pie" || chartType === "donut") && (
                <div className="flex items-center justify-center gap-16">
                  <svg viewBox="-110 -110 220 220" className="w-[400px] h-[400px]">
                    {(() => {
                      let cumAngle = -Math.PI / 2;
                      return data.map((d, i) => {
                        const angle = (d.value / total) * 2 * Math.PI;
                        const x1 = Math.cos(cumAngle) * 100;
                        const y1 = Math.sin(cumAngle) * 100;
                        cumAngle += angle;
                        const x2 = Math.cos(cumAngle) * 100;
                        const y2 = Math.sin(cumAngle) * 100;
                        const largeArc = angle > Math.PI ? 1 : 0;
                        const innerR = chartType === "donut" ? 55 : 0;
                        const ix1 = chartType === "donut" ? Math.cos(cumAngle) * innerR : 0;
                        const iy1 = chartType === "donut" ? Math.sin(cumAngle) * innerR : 0;
                        const ix2 = chartType === "donut" ? Math.cos(cumAngle - angle) * innerR : 0;
                        const iy2 = chartType === "donut" ? Math.sin(cumAngle - angle) * innerR : 0;

                        const path = chartType === "donut"
                          ? `M ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`
                          : `M 0 0 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`;

                        return <path key={i} d={path} fill={COLORS[i % COLORS.length]} stroke="var(--slide-bg, #0A0A0A)" strokeWidth="2" />;
                      });
                    })()}
                  </svg>
                  <div className="flex flex-col gap-4">
                    {data.map((d, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-6 h-6 rounded-md shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-[28px]" style={{ ...fg, ...bodyFont }}>{d.label}</span>
                        <span className="text-[28px] font-bold" style={primaryColor}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[36px] text-center" style={mutedColor}>Add chart data to visualize</div>
          )}
        </div>
      );
    }

    case "table":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <h2 className={`text-[72px] font-bold mb-16 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
            <Md>{c.heading || "Table"}</Md>
          </h2>
          <table className="w-full text-[28px]" style={{ ...bodyFont, ...fg }}>
            {c.tableHeaders && c.tableHeaders.length > 0 && (
              <thead>
                <tr>
                  {c.tableHeaders.map((h, i) => (
                    <th key={i} className="text-left p-4 border-b-2 font-bold" style={{ borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(c.tableRows || []).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="p-4 border-b" style={{ borderColor: "var(--slide-secondary, hsl(var(--secondary)))" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    /* ─── Quiz / Assessment Block ─── */
    case "quiz":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h2 className={`text-[60px] font-bold mb-4 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading || "Knowledge Check"}</Md>
            </h2>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("question")}>
            <p className={`text-[40px] mb-12 leading-snug max-w-[1400px] ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
              {c.question || "Your question here?"}
            </p>
          </AnimEl>
          {c.questionType !== "open-ended" && (c.options || []).length > 0 && (
            <div className="grid grid-cols-2 gap-6 max-w-[1400px]">
              {(c.options || []).map((opt, i) => (
                <AnimEl key={i} index={i + 2} animation={anim} isPresenting={isPresenting}>
                  <div className="flex items-center gap-6 p-8 rounded-2xl border-2" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))", opacity: 0.85 }}>
                    <span className="text-[36px] font-bold shrink-0 w-14 h-14 rounded-xl flex items-center justify-center" style={primaryBg}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-[30px]" style={{ ...fg, ...bodyFont }}>{opt}</span>
                  </div>
                </AnimEl>
              ))}
            </div>
          )}
          {c.questionType === "open-ended" && (
            <div className="max-w-[1200px] p-8 rounded-2xl border-2 border-dashed" style={{ borderColor: "var(--slide-muted, hsl(var(--muted-foreground)))" }}>
              <p className="text-[28px]" style={mutedColor}>Open-ended — learners write their own response</p>
            </div>
          )}
          {c.explanation && (
            <AnimEl index={6} animation={anim} isPresenting={isPresenting}>
              <div className="mt-10 p-6 rounded-xl max-w-[1400px]" style={{ ...secondaryBg, opacity: 0.7 }}>
                <p className="text-[24px]" style={{ ...mutedColor, ...bodyFont }}>💡 {c.explanation}</p>
              </div>
            </AnimEl>
          )}
        </div>
      );

    /* ─── Lesson Objective Block ─── */
    case "lesson-objective":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-8">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[72px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "What You'll Learn"}</Md>
              </h2>
            </div>
          </AnimEl>
          <div className="space-y-6 max-w-[1400px]">
            {(c.objectives || ["Objective 1", "Objective 2", "Objective 3"]).map((obj, i) => (
              <AnimEl key={i} index={i + 1} animation={anim} isPresenting={isPresenting}>
                <div className="flex items-start gap-6 p-6 rounded-2xl" style={secondaryBg}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-[24px] font-bold" style={primaryBg}>
                    {i + 1}
                  </div>
                  <p className={`text-[32px] leading-snug pt-1 ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                    <Md>{obj}</Md>
                  </p>
                </div>
              </AnimEl>
            ))}
          </div>
        </div>
      );

    /* ─── Key Takeaway Block ─── */
    case "key-takeaway":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-4 mb-6">
              {c.icon && <span className="text-[72px]">{c.icon}</span>}
              <h2 className={`text-[56px] font-bold ${!theme ? "font-display text-muted-foreground" : ""}`} style={{ ...mutedColor, ...headingFont }}>
                <Md>{c.heading || "Key Takeaway"}</Md>
              </h2>
            </div>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("takeaway")}>
            <div className="max-w-[1300px] p-16 rounded-3xl border-l-8" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
              <p className={`text-[40px] leading-relaxed ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.takeaway || "The most important idea from this section."}</Md>
              </p>
            </div>
          </AnimEl>
        </div>
      );

    /* ─── Activity / Exercise Block ─── */
    case "activity":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-8">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[72px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "Activity"}</Md>
              </h2>
            </div>
          </AnimEl>
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("body")}>
            <div className="max-w-[1400px] p-12 rounded-3xl border-2" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
              <p className={`text-[34px] leading-relaxed ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                <Md>{c.instructions || "Instructions for the activity..."}</Md>
              </p>
            </div>
          </AnimEl>
          <div className="flex gap-8 mt-10">
            {c.duration && (
              <AnimEl index={2} animation={anim} isPresenting={isPresenting}>
                <div className="px-8 py-4 rounded-xl flex items-center gap-3" style={secondaryBg}>
                  <span className="text-[28px]">⏱</span>
                  <span className="text-[28px] font-semibold" style={{ ...fg, ...bodyFont }}>{c.duration}</span>
                </div>
              </AnimEl>
            )}
            {c.activityType && (
              <AnimEl index={3} animation={anim} isPresenting={isPresenting}>
                <div className="px-8 py-4 rounded-xl flex items-center gap-3" style={secondaryBg}>
                  <span className="text-[28px]">{c.activityType === "group" ? "👥" : c.activityType === "discussion" ? "💬" : "👤"}</span>
                  <span className="text-[28px] font-semibold capitalize" style={{ ...fg, ...bodyFont }}>{c.activityType}</span>
                </div>
              </AnimEl>
            )}
          </div>
        </div>
      );

    /* ─── Progress Checkpoint Block ─── */
    case "progress-checkpoint": {
      const completed = c.completedModules || [];
      const upcoming = c.upcomingModules || [];
      const current = c.currentModule || "Current Module";
      const pct = c.progressPercent ?? 50;
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <h2 className={`text-[60px] font-bold mb-4 ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
              <Md>{c.heading || "Your Progress"}</Md>
            </h2>
          </AnimEl>
          {/* Progress bar */}
          <AnimEl index={1} animation={anim} isPresenting={isPresenting} morphId={morphId("bar")}>
            <div className="w-full max-w-[1400px] h-8 rounded-full mb-12 overflow-hidden" style={{ backgroundColor: "var(--slide-secondary, hsl(var(--secondary)))" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "var(--slide-primary, hsl(var(--primary)))" }} />
            </div>
            <p className="text-[28px] -mt-8 mb-12 font-bold" style={primaryColor}>{pct}% complete</p>
          </AnimEl>
          {/* Module list */}
          <div className="space-y-4 max-w-[1400px]">
            {completed.map((m, i) => (
              <AnimEl key={`done-${i}`} index={i + 2} animation={anim} isPresenting={isPresenting}>
                <div className="flex items-center gap-5 p-5 rounded-xl opacity-60" style={secondaryBg}>
                  <span className="text-[28px]">✅</span>
                  <span className="text-[28px] line-through" style={{ ...mutedColor, ...bodyFont }}>{m}</span>
                </div>
              </AnimEl>
            ))}
            <AnimEl index={completed.length + 2} animation={anim} isPresenting={isPresenting}>
              <div className="flex items-center gap-5 p-5 rounded-xl border-2" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                <span className="text-[28px]">📍</span>
                <span className="text-[28px] font-bold" style={{ ...fg, ...bodyFont }}>{current}</span>
                <span className="text-[22px] px-4 py-1 rounded-full ml-auto font-semibold" style={primaryBg}>Current</span>
              </div>
            </AnimEl>
            {upcoming.map((m, i) => (
              <AnimEl key={`next-${i}`} index={completed.length + 3 + i} animation={anim} isPresenting={isPresenting}>
                <div className="flex items-center gap-5 p-5 rounded-xl opacity-40" style={secondaryBg}>
                  <span className="text-[28px]">⬜</span>
                  <span className="text-[28px]" style={{ ...mutedColor, ...bodyFont }}>{m}</span>
                </div>
              </AnimEl>
            ))}
          </div>
        </div>
      );
    }

    /* ─── Concept Explanation Block ─── */
    case "concept":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-8">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[72px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "Concept"}</Md>
              </h2>
            </div>
          </AnimEl>
          {c.definition && (
            <AnimEl index={1} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("def")}>
              <div className="max-w-[1400px] p-10 rounded-2xl border-l-8 mb-8" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                <p className="text-[20px] font-semibold uppercase tracking-widest mb-3" style={mutedColor}>Definition</p>
                <p className={`text-[36px] leading-relaxed ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                  <Md>{c.definition}</Md>
                </p>
              </div>
            </AnimEl>
          )}
          {c.analogy && (
            <AnimEl index={2} animation={anim} isPresenting={isPresenting}>
              <div className="max-w-[1400px] p-8 rounded-2xl mb-6" style={secondaryBg}>
                <p className="text-[20px] font-semibold uppercase tracking-widest mb-2" style={primaryColor}>💡 Analogy</p>
                <p className={`text-[32px] leading-relaxed italic ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                  <Md>{c.analogy}</Md>
                </p>
              </div>
            </AnimEl>
          )}
          {c.example && (
            <AnimEl index={3} animation={anim} isPresenting={isPresenting}>
              <div className="max-w-[1400px] p-8 rounded-2xl" style={secondaryBg}>
                <p className="text-[20px] font-semibold uppercase tracking-widest mb-2" style={primaryColor}>📌 Example</p>
                <p className={`text-[32px] leading-relaxed ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
                  <Md>{c.example}</Md>
                </p>
              </div>
            </AnimEl>
          )}
        </div>
      );

    /* ─── Guided Notes / Fill-in Prompt Block ─── */
    case "guided-notes":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-6">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[72px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "Guided Notes"}</Md>
              </h2>
            </div>
          </AnimEl>
          {c.instructions && (
            <AnimEl index={1} animation={anim} isPresenting={isPresenting}>
              <p className={`text-[28px] mb-10 max-w-[1400px] ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
                <Md>{c.instructions}</Md>
              </p>
            </AnimEl>
          )}
          <div className="space-y-6 max-w-[1400px]">
            {(c.prompts || ["Fill in the blank: _____ "]).map((prompt, i) => (
              <AnimEl key={i} index={i + 2} animation={anim} isPresenting={isPresenting}>
                <div className="flex items-start gap-6 p-8 rounded-2xl border-2 border-dashed" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                  <span className="text-[28px] font-bold shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={primaryBg}>
                    {i + 1}
                  </span>
                  <p className={`text-[30px] leading-relaxed ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                    <Md>{prompt}</Md>
                  </p>
                </div>
              </AnimEl>
            ))}
          </div>
        </div>
      );

    /* ─── Scripture / Text Study Block ─── */
    case "scripture":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-4">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[60px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "Text Study"}</Md>
              </h2>
            </div>
          </AnimEl>
          {c.reference && (
            <AnimEl index={1} animation={anim} isPresenting={isPresenting}>
              <p className="text-[24px] font-semibold uppercase tracking-widest mb-6" style={primaryColor}>
                {c.reference}
              </p>
            </AnimEl>
          )}
          {c.passage && (
            <AnimEl index={2} animation={anim} isPresenting={isPresenting} elementAnim={c.bodyAnimation} morphId={morphId("passage")}>
              <div className="max-w-[1400px] p-12 rounded-3xl border-l-8 mb-8" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                <p className={`text-[40px] leading-relaxed italic ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                  "{c.passage}"
                </p>
              </div>
            </AnimEl>
          )}
          {c.commentary && (
            <AnimEl index={3} animation={anim} isPresenting={isPresenting}>
              <p className={`text-[30px] leading-relaxed max-w-[1400px] mb-8 ${!theme ? "text-muted-foreground" : ""}`} style={{ ...mutedColor, ...bodyFont }}>
                <Md>{c.commentary}</Md>
              </p>
            </AnimEl>
          )}
          {(c.reflectionQuestions || []).length > 0 && (
            <div className="space-y-4 max-w-[1400px]">
              <p className="text-[22px] font-semibold uppercase tracking-widest" style={primaryColor}>Reflection</p>
              {(c.reflectionQuestions || []).map((q, i) => (
                <AnimEl key={i} index={i + 4} animation={anim} isPresenting={isPresenting}>
                  <div className="flex items-start gap-4 p-6 rounded-xl" style={secondaryBg}>
                    <span className="text-[24px]">💭</span>
                    <p className={`text-[28px] leading-snug ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>{q}</p>
                  </div>
                </AnimEl>
              ))}
            </div>
          )}
        </div>
      );

    /* ─── Recap / Reinforcement Block ─── */
    case "recap":
      return (
        <div className="w-full h-full flex flex-col justify-center p-24" style={{ ...wrapStyle, ...bg }}>
          <AnimEl index={0} animation={anim} isPresenting={isPresenting} elementAnim={c.headingAnimation} morphId={morphId("heading")}>
            <div className="flex items-center gap-6 mb-8">
              {c.icon && <span className="text-[64px]">{c.icon}</span>}
              <h2 className={`text-[72px] font-bold ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                <Md>{c.heading || "Recap"}</Md>
              </h2>
            </div>
          </AnimEl>
          {(c.keyPoints || []).length > 0 && (
            <div className="space-y-4 max-w-[1400px] mb-10">
              <p className="text-[22px] font-semibold uppercase tracking-widest" style={primaryColor}>Key Points</p>
              {(c.keyPoints || []).map((pt, i) => (
                <AnimEl key={i} index={i + 1} animation={anim} isPresenting={isPresenting}>
                  <div className="flex items-start gap-5 p-6 rounded-xl" style={secondaryBg}>
                    <span className="text-[24px]">✓</span>
                    <p className={`text-[30px] leading-snug ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                      <Md>{pt}</Md>
                    </p>
                  </div>
                </AnimEl>
              ))}
            </div>
          )}
          {(c.actionItems || []).length > 0 && (
            <div className="space-y-4 max-w-[1400px] mb-10">
              <p className="text-[22px] font-semibold uppercase tracking-widest" style={primaryColor}>Action Items</p>
              {(c.actionItems || []).map((item, i) => (
                <AnimEl key={i} index={(c.keyPoints?.length || 0) + i + 1} animation={anim} isPresenting={isPresenting}>
                  <div className="flex items-start gap-5 p-6 rounded-xl border-2" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                    <span className="text-[24px]">→</span>
                    <p className={`text-[28px] leading-snug ${!theme ? "text-foreground" : ""}`} style={{ ...fg, ...bodyFont }}>
                      <Md>{item}</Md>
                    </p>
                  </div>
                </AnimEl>
              ))}
            </div>
          )}
          {c.closingThought && (
            <AnimEl index={10} animation={anim} isPresenting={isPresenting}>
              <div className="max-w-[1300px] p-10 rounded-3xl border-l-8" style={{ ...secondaryBg, borderColor: "var(--slide-primary, hsl(var(--primary)))" }}>
                <p className={`text-[34px] leading-relaxed italic ${!theme ? "font-display text-foreground" : ""}`} style={{ ...fg, ...headingFont }}>
                  💡 <Md>{c.closingThought}</Md>
                </p>
              </div>
            </AnimEl>
          )}
        </div>
      );

    default:
      return (
        <div className="w-full h-full flex items-center justify-center" style={{ ...wrapStyle, ...bg }}>
          <p className="text-[36px]" style={mutedColor}>Empty slide</p>
        </div>
      );
  }
}

function convertToEmbed(url: string): string {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
  return url;
}
