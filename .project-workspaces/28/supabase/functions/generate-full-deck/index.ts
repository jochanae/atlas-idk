import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THEME_MAP: Record<string, object> = {
  "midnight-gold": { id: "midnight-gold", name: "Midnight Gold", background: "#0A1628", foreground: "#F0F0F0", primary: "#D4AF37", secondary: "#1A2744", muted: "#8899AA", accent: "#F5A623", headingFont: "Space Grotesk", bodyFont: "Inter", mode: "dark", backgroundGradient: "linear-gradient(135deg, #0A1628 0%, #162040 50%, #1A2744 100%)" },
  "clean-white": { id: "clean-white", name: "Clean White", background: "#FFFFFF", foreground: "#1A1A2E", primary: "#2563EB", secondary: "#F1F5F9", muted: "#64748B", accent: "#3B82F6", headingFont: "Space Grotesk", bodyFont: "Inter", mode: "light", backgroundGradient: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)" },
  "deep-navy": { id: "deep-navy", name: "Deep Navy", background: "#0B1121", foreground: "#E2E8F0", primary: "#60A5FA", secondary: "#1E293B", muted: "#94A3B8", accent: "#38BDF8", headingFont: "Playfair Display", bodyFont: "Source Sans 3", mode: "dark", backgroundGradient: "linear-gradient(160deg, #0B1121 0%, #0F172A 40%, #1E293B 100%)" },
  "warm-coral": { id: "warm-coral", name: "Warm Coral", background: "#FFF5F5", foreground: "#1A1A2E", primary: "#E11D48", secondary: "#FFF1F2", muted: "#6B7280", accent: "#FB7185", headingFont: "DM Serif Display", bodyFont: "DM Sans", mode: "light", backgroundGradient: "linear-gradient(135deg, #FFF5F5 0%, #FFF1F2 50%, #FCE7F3 100%)" },
  "ocean-dark": { id: "ocean-dark", name: "Ocean", background: "#0A192F", foreground: "#CCD6F6", primary: "#64FFDA", secondary: "#112240", muted: "#8892B0", accent: "#64FFDA", headingFont: "Montserrat", bodyFont: "Open Sans", mode: "dark", backgroundGradient: "linear-gradient(135deg, #0A192F 0%, #0D2137 50%, #112240 100%)" },
  "royal-purple": { id: "royal-purple", name: "Royal", background: "#1A0A2E", foreground: "#F0E6FF", primary: "#BB86FC", secondary: "#2D1B4E", muted: "#9E8EC0", accent: "#CF6FFF", headingFont: "Outfit", bodyFont: "Nunito Sans", mode: "dark", backgroundGradient: "linear-gradient(160deg, #1A0A2E 0%, #2D1B4E 60%, #3D2660 100%)" },
  "forest-green": { id: "forest-green", name: "Forest", background: "#0F1F1C", foreground: "#E8F5E9", primary: "#4CAF50", secondary: "#1B3B36", muted: "#81C784", accent: "#66BB6A", headingFont: "Space Grotesk", bodyFont: "Inter", mode: "dark", backgroundGradient: "linear-gradient(135deg, #0F1F1C 0%, #1B3B36 50%, #1A3330 100%)" },
  "warm-sunset": { id: "warm-sunset", name: "Sunset", background: "#FFF8F0", foreground: "#2D1B0E", primary: "#E65100", secondary: "#FFF3E0", muted: "#8D6E63", accent: "#FF6D00", headingFont: "Bebas Neue", bodyFont: "Roboto", mode: "light", backgroundGradient: "linear-gradient(135deg, #FFF8F0 0%, #FFF3E0 50%, #FFECB3 100%)" },
  "minimal-gray": { id: "minimal-gray", name: "Minimal", background: "#FAFAFA", foreground: "#18181B", primary: "#18181B", secondary: "#F4F4F5", muted: "#71717A", accent: "#18181B", headingFont: "Space Grotesk", bodyFont: "Inter", mode: "light", backgroundGradient: "linear-gradient(180deg, #FAFAFA 0%, #F4F4F5 100%)" },
  "charcoal-amber": { id: "charcoal-amber", name: "Charcoal Amber", background: "#1C1917", foreground: "#FAFAF9", primary: "#F59E0B", secondary: "#292524", muted: "#A8A29E", accent: "#FBBF24", headingFont: "DM Serif Display", bodyFont: "DM Sans", mode: "dark", backgroundGradient: "linear-gradient(160deg, #1C1917 0%, #292524 60%, #1C1917 100%)" },
};

const THEME_IDS = Object.keys(THEME_MAP);

/** Hash-based theme rotation: deterministic but varied based on topic string */
function hashThemeId(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    const char = topic.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % THEME_IDS.length;
  return THEME_IDS[index];
}

function validateSlide(slide: any, index: number, total: number): string | null {
  if (!slide.block_type || typeof slide.block_type !== "string") {
    return `Slide ${index + 1}: missing block_type`;
  }
  if (!slide.content || typeof slide.content !== "object") {
    return `Slide ${index + 1}: missing content`;
  }
  const c = slide.content;

  switch (slide.block_type) {
    case "title":
      if (!c.heading) return `Slide ${index + 1} (title): missing heading`;
      break;
    case "story":
      if (!c.heading) return `Slide ${index + 1} (story): missing heading`;
      if (!c.body) return `Slide ${index + 1} (story): missing body`;
      break;
    case "data":
      if (!c.heading) return `Slide ${index + 1} (data): missing heading`;
      if (!c.metric) return `Slide ${index + 1} (data): missing metric`;
      break;
    case "quote":
      if (!c.quote) return `Slide ${index + 1} (quote): missing quote`;
      break;
    case "framework":
      if (!c.heading) return `Slide ${index + 1} (framework): missing heading`;
      if (!Array.isArray(c.steps) || c.steps.length === 0) return `Slide ${index + 1} (framework): missing steps`;
      break;
    case "cta":
      if (!c.heading) return `Slide ${index + 1} (cta): missing heading`;
      break;
    case "comparison":
      if (!c.heading) return `Slide ${index + 1} (comparison): missing heading`;
      if (!c.left || !c.right) return `Slide ${index + 1} (comparison): missing left/right`;
      break;
    case "bio":
      if (!c.heading && !c.name) return `Slide ${index + 1} (bio): missing heading or name`;
      break;
    case "testimonial":
      if (!c.quote && !c.name) return `Slide ${index + 1} (testimonial): missing quote or name`;
      break;
    case "chart":
      if (!c.heading) return `Slide ${index + 1} (chart): missing heading`;
      break;
    case "table":
      if (!c.heading) return `Slide ${index + 1} (table): missing heading`;
      break;
    case "gif":
      if (!c.heading) return `Slide ${index + 1} (gif): missing heading`;
      break;
    case "lottie":
      if (!c.heading) return `Slide ${index + 1} (lottie): missing heading`;
      break;
    case "quiz":
      if (!c.heading) return `Slide ${index + 1} (quiz): missing heading`;
      if (!c.question) return `Slide ${index + 1} (quiz): missing question`;
      if (!Array.isArray(c.choices) || c.choices.length < 2) return `Slide ${index + 1} (quiz): missing choices`;
      break;
    case "lesson-objective":
      if (!c.heading) return `Slide ${index + 1} (lesson-objective): missing heading`;
      if (!Array.isArray(c.objectives) || c.objectives.length === 0) return `Slide ${index + 1} (lesson-objective): missing objectives`;
      break;
    case "key-takeaway":
      if (!c.heading) return `Slide ${index + 1} (key-takeaway): missing heading`;
      if (!c.body) return `Slide ${index + 1} (key-takeaway): missing body`;
      break;
    case "activity":
      if (!c.heading) return `Slide ${index + 1} (activity): missing heading`;
      if (!c.body) return `Slide ${index + 1} (activity): missing body`;
      break;
    case "progress-checkpoint":
      if (!c.heading) return `Slide ${index + 1} (progress-checkpoint): missing heading`;
      break;
  }
  return null;
}

function repairSlide(slide: any): any {
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
    case "bio":
      if (!c.heading) c.heading = "About";
      if (!c.name) c.name = "";
      if (!c.role) c.role = "";
      if (!c.body) c.body = "";
      break;
    case "testimonial":
      if (!c.quote) c.quote = "—";
      if (!c.name) c.name = "";
      break;
    case "chart":
      if (!c.heading) c.heading = "Data Overview";
      if (!c.chartType) c.chartType = "bar";
      if (!Array.isArray(c.labels)) c.labels = ["A", "B", "C"];
      if (!Array.isArray(c.values)) c.values = [10, 20, 30];
      break;
    case "table":
      if (!c.heading) c.heading = "Overview";
      if (!Array.isArray(c.headers)) c.headers = ["Column 1", "Column 2"];
      if (!Array.isArray(c.rows)) c.rows = [["—", "—"]];
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
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUser = createClient(supabaseUrl, supabaseKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // --- Input validation: enforce payload size limit (2 MB for attachments) ---
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 2_000_000) {
      return new Response(JSON.stringify({ error: "Payload too large (max 2 MB)" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const topic = typeof body.topic === "string" ? body.topic : "";
    const slideCount = typeof body.slideCount === "number" ? body.slideCount : 8;
    const style = typeof body.style === "string" ? body.style : "professional";
    const fullPrompt = typeof body.fullPrompt === "string" ? body.fullPrompt : "";
    const existingDeckContext = typeof body.existingDeckContext === "string" ? body.existingDeckContext : "";
    const attachedFileContent = typeof body.attachedFileContent === "string" ? body.attachedFileContent : "";
    const attachedFileName = typeof body.attachedFileName === "string" ? body.attachedFileName : "";

    // Use fullPrompt if provided (verbatim user request), otherwise fall back to topic
    const userRequest = fullPrompt?.trim() || topic?.trim() || "";
    const hasAttachedContext = existingDeckContext.length > 0 || attachedFileContent.length > 0;
    if (!hasAttachedContext && (!userRequest || userRequest.length < 3)) {
      throw new Error("Please provide a topic of at least 3 characters");
    }
    if (userRequest.length > 100_000) {
      return new Response(JSON.stringify({ error: "Prompt too long (max 100,000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clampedCount = Math.max(4, Math.min(20, slideCount));

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are PresentQ's expert presentation builder. You create presentations that are visually unique and tailored to each user's exact specifications.

CRITICAL INSTRUCTION — HONOR THE USER'S FULL REQUEST VERBATIM:
The user's message is their complete creative brief. Every detail they mention MUST be reflected in the output:
- If they specify a slide count, use EXACTLY that number (within 4-20 range).
- If they mention wanting an image of themselves, a bio photo, or a headshot, include a "bio" slide with an "imageUrl" placeholder field set to "USER_PHOTO" so they can replace it.
- If they mention contact information (email, phone, website, social links), include it in a "cta" or "bio" slide's content fields.
- If they mention background music, set "backgroundMusicUrl" in the first slide's content to "USER_MUSIC" as a placeholder.
- If they request specific images on specific slides, add "imageUrl" to that slide's content with a descriptive placeholder like "IMAGE: [their description]".
- If they mention a specific tone, color scheme, or visual style, choose the theme that best matches.
- If they request specific slide types or layouts, use those exact types.
- If they mention specific content for specific pages (e.g. "page 3 should have..."), follow that structure precisely.

THEME SELECTION (CRITICAL — MUST VARY):
You MUST choose a theme_id that matches the content's tone. NEVER default to "midnight-gold" unless it genuinely fits.

CRITICAL: If the user explicitly asks for a "light" background, "white" background, "bright" theme, or anything suggesting a light color scheme, you MUST choose one of these LIGHT themes:
- "clean-white": Corporate, professional, medical, legal, clean/minimal topics
- "warm-coral": Creative, personal stories, poetry, love, emotional topics, faith, lifestyle  
- "warm-sunset": Energy, motivation, sports, community, warm personal stories, food
- "minimal-gray": Academic, research, data-heavy, journalism, minimalist, photography

If the user asks for a "dark" background or doesn't specify, choose from ALL themes including dark ones:
- "midnight-gold": Executive, premium, business pitches, finance, leadership
- "deep-navy": Editorial, thought leadership, tech strategy, policy
- "ocean-dark": Tech, engineering, DevOps, programming, startups, innovation
- "royal-purple": Inspirational, spiritual, visionary, transformation, self-help, music
- "forest-green": Nature, sustainability, health, wellness, growth, environment
- "charcoal-amber": History, luxury, storytelling, scripture, heritage, culture, vintage

Be creative with theme selection! A cooking presentation → "warm-sunset". A poetry reading → "warm-coral" or "royal-purple". A startup pitch → "ocean-dark". A history lesson → "charcoal-amber". A travel deck asking for light → "clean-white" or "warm-sunset".

CONTENT FIELDS THAT SUPPORT IMAGES:
Any slide type can include an optional "imageUrl" field in its content. When the user requests images on specific slides, include this field with a descriptive value.

RICH CONTENT PHILOSOPHY:
- Per-element animations: Only add when they choreograph attention meaningfully
- Morph transitions: Only between slides with shared visual elements for continuity
- Do NOT use Lottie blocks — most LottieFiles CDN URLs are unreliable.
If an enhancement doesn't improve clarity, confidence, or persuasion — leave it out.`,
          },
          {
            role: "user",
            content: `USER'S COMPLETE REQUEST:
"""
${userRequest || "Regenerate/rebuild the attached content with the specified style."}
"""

${existingDeckContext ? `EXISTING DECK TO REBUILD:
${existingDeckContext}

The user wants this deck regenerated. Use the existing slides as the foundation — preserve key content, improve structure, and apply the requested style. If the user provided additional instructions above, follow them. Otherwise, rebuild the deck with better flow, richer content, and the chosen style.\n\n` : ""}${attachedFileContent ? `REFERENCE DOCUMENT (${attachedFileName}):
${attachedFileContent.slice(0, 80_000)}

Use this document as the primary source for generating slide content. Extract key points, data, and structure from it.\n\n` : ""}Style preference: ${style}
Requested slide count: ${clampedCount}

Based on the user's COMPLETE request above, create the presentation. If the user specified details about specific slides, images, contact info, music, or any other specifics — include ALL of them.

Return a JSON object with this EXACT structure:
{
  "title": "Compelling presentation title derived from the user's request",
  "description": "One sentence about the deck",
  "theme_id": "chosen-theme-id-from-the-list-above",
  "slides": [
    {
      "block_type": "title",
      "content": { "heading": "Main Title Here", "subheading": "Subtitle with context", "layout": "center" },
      "notes": "Speaker notes here"
    },
    ... more slides ...
  ]
}

SLIDE TYPES AND REQUIRED FIELDS (every field MUST have real content):
- "title": { "heading": "string", "subheading": "string", "layout": "center", "imageUrl": "optional" }
- "story": { "heading": "string", "body": "2-4 detailed sentences", "layout": "left", "imageUrl": "optional" }
- "data": { "heading": "string", "metric": "e.g. 47%", "description": "explanation of the metric", "layout": "center" }
- "quote": { "quote": "full meaningful quote", "attribution": "Person Name", "layout": "center" }
- "framework": { "heading": "string", "steps": ["Step 1 description", "Step 2 description", "Step 3 description"], "layout": "columns" }
- "cta": { "heading": "string", "body": "string", "buttonText": "string", "layout": "center", "contactEmail": "optional", "contactPhone": "optional", "websiteUrl": "optional", "socialLinks": "optional" }
- "comparison": { "heading": "string", "left": { "title": "Option A", "points": ["point 1", "point 2"] }, "right": { "title": "Option B", "points": ["point 1", "point 2"] }, "layout": "split" }
- "testimonial": { "quote": "testimonial text", "name": "Person", "role": "Their Role", "layout": "center" }
- "bio": { "heading": "About", "name": "Name", "role": "Role", "body": "Bio text", "imageUrl": "optional photo URL or USER_PHOTO placeholder", "layout": "left" }
- "gif": { "heading": "string", "gifUrl": "URL to GIF", "caption": "why motion matters here", "layout": "center" }

OPTIONAL ENHANCEMENTS (add only when they meaningfully improve the deck):
- Per-element animations: Add "animations" to content: { "animations": { "heading": { "type": "fade"|"slide"|"scale"|"blur", "delay": 0, "duration": 0.6 } } }
  Only use for progressive reveal where attention choreography matters.
- Morph transitions: Add "transition": "morph" to content when consecutive slides share visual elements.

RULES:
1. Slide 1 MUST be "title" type. Last slide SHOULD be "cta" type (unless user specifies otherwise).
2. Use at least 4 different block types.
3. EVERY field must have specific, topic-relevant content — NO placeholders, NO empty strings.
4. Include 2-3 sentence speaker notes for each slide.
5. Use GIF blocks sparingly (0-2 per deck) and only when motion adds meaning.
6. Add animations to at most 3-4 slides where progressive reveal improves comprehension.
7. HONOR EVERY SPECIFIC DETAIL from the user's request.
8. If user mentions wanting their photo, use "USER_PHOTO" as imageUrl in a bio slide.
9. If user mentions contact info, include it in the CTA or bio slide content fields.
10. If user mentions music, add "backgroundMusicUrl": "USER_MUSIC" to the first slide's content.

Return ONLY valid JSON, no markdown formatting.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("No content in AI response:", JSON.stringify(aiData).slice(0, 500));
      throw new Error("AI did not return data — please try again");
    }

    let deckData: any;
    try {
      deckData = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("Failed to parse AI output:", rawContent?.slice(0, 500));
      throw new Error("AI returned malformed data — please try again");
    }

    // Validate and repair
    if (!deckData.title || deckData.title.trim().length === 0) {
      deckData.title = `Presentation: ${userRequest.slice(0, 60)}`;
    }
    if (!deckData.description) {
      deckData.description = `A ${style} presentation about ${userRequest.slice(0, 100)}`;
    }
    if (!Array.isArray(deckData.slides) || deckData.slides.length === 0) {
      throw new Error("AI generated an empty deck — please try again with a more specific topic");
    }

    // Validate each slide and repair if needed
    const validationIssues: string[] = [];
    const repairedSlides = deckData.slides.map((slide: any, i: number) => {
      const issue = validateSlide(slide, i, deckData.slides.length);
      if (issue) {
        validationIssues.push(issue);
        return repairSlide(slide);
      }
      return slide;
    });

    if (validationIssues.length > 0) {
      console.warn("Repaired slide issues:", validationIssues);
    }

    // Ensure exactly ONE title slide at position 0 — deduplicate extras
    const titleIndices = repairedSlides
      .map((s: any, i: number) => s.block_type === "title" ? i : -1)
      .filter((i: number) => i >= 0);

    if (titleIndices.length === 0) {
      // No title slide at all — inject one
      repairedSlides.unshift({
        block_type: "title",
        content: { heading: deckData.title, subheading: deckData.description, layout: "center" },
        notes: "Welcome your audience and introduce the topic.",
      });
    } else if (titleIndices.length === 1) {
      // One title — move to position 0 if not already
      if (titleIndices[0] !== 0) {
        const [titleSlide] = repairedSlides.splice(titleIndices[0], 1);
        repairedSlides.unshift(titleSlide);
      }
    } else {
      // Multiple title slides — keep the one with the richest content, remove duplicates
      // Pick the best title slide (longest heading + has subheading)
      let bestIdx = titleIndices[0];
      let bestScore = 0;
      for (const idx of titleIndices) {
        const c = repairedSlides[idx].content || {};
        const score = (c.heading?.length || 0) + (c.subheading?.length || 0) + (repairedSlides[idx].notes?.length || 0);
        if (score > bestScore) { bestScore = score; bestIdx = idx; }
      }
      // Remove all title slides except the best one (iterate in reverse to keep indices stable)
      for (let i = titleIndices.length - 1; i >= 0; i--) {
        if (titleIndices[i] !== bestIdx) {
          repairedSlides.splice(titleIndices[i], 1);
        }
      }
      // Move the remaining title to position 0
      const currentTitleIdx = repairedSlides.findIndex((s: any) => s.block_type === "title");
      if (currentTitleIdx > 0) {
        const [titleSlide] = repairedSlides.splice(currentTitleIdx, 1);
        repairedSlides.unshift(titleSlide);
      }
      console.warn(`Deduplicated ${titleIndices.length - 1} extra title slide(s)`);
    }

    // Ensure last slide is CTA — only add if none exists
    const hasCta = repairedSlides.some((s: any) => s.block_type === "cta");
    if (!hasCta) {
      repairedSlides.push({
        block_type: "cta",
        content: { heading: "Let's Get Started", body: "Ready to take the next step? Reach out to continue the conversation.", buttonText: "Get in Touch", layout: "center" },
        notes: "End with your call to action. Invite questions.",
      });
    }

    // Resolve theme — hash-based fallback instead of always defaulting to midnight-gold
    const selectedTheme = THEME_MAP[deckData.theme_id] || THEME_MAP[hashThemeId(userRequest)];

    // Create presentation in DB
    const { data: presentation, error: presError } = await supabaseUser
      .from("presentations")
      .insert({
        title: deckData.title,
        description: deckData.description,
        user_id: user.id,
        goal: "Inform",
        theme: selectedTheme,
      })
      .select("id")
      .single();

    if (presError) throw presError;

    const slidesToInsert = repairedSlides.map((slide: any, index: number) => ({
      presentation_id: presentation.id,
      user_id: user.id,
      block_type: slide.block_type,
      content: slide.content,
      notes: slide.notes || "Discuss this slide's key points with your audience.",
      sort_order: index,
    }));

    const { data: insertedSlides, error: slidesError } = await supabaseUser
      .from("slides")
      .insert(slidesToInsert)
      .select("id");

    if (slidesError) throw slidesError;

    const slideIds = insertedSlides.map((s: any) => s.id);
    await supabaseUser
      .from("presentations")
      .update({ slide_order: slideIds })
      .eq("id", presentation.id);

    return new Response(
      JSON.stringify({
        id: presentation.id,
        title: deckData.title,
        slideCount: insertedSlides.length,
        repaired: validationIssues.length,
        themeUsed: (selectedTheme as any)?.id || "unknown",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-full-deck error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
