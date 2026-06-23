import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // --- Input validation: enforce file size limit (50 MB) ---
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 50_000_000) {
      return new Response(
        JSON.stringify({ error: "File too large (max 50 MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mode = (formData.get("mode") as string) || "faithful";
    const title = (formData.get("title") as string) || file?.name?.replace(/\.(pdf|pptx?)$/i, "") || "Imported Presentation";

    if (!file) throw new Error("No file provided");

    // Validate file size (double-check actual file)
    if (file.size > 50_000_000) {
      return new Response(
        JSON.stringify({ error: "File too large (max 50 MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file type
    const allowedExtensions = [".pdf", ".pptx", ".ppt", ".txt", ".md"];
    const ext = file.name.toLowerCase().match(/\.[a-z]+$/)?.[0] || "";
    if (!allowedExtensions.includes(ext)) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type. Allowed: ${allowedExtensions.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate mode
    if (!["faithful", "ai"].includes(mode)) {
      return new Response(
        JSON.stringify({ error: "mode must be 'faithful' or 'ai'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate title length
    if (title.length > 500) {
      return new Response(
        JSON.stringify({ error: "Title too long (max 500 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBytes = await file.arrayBuffer();
    const lower = file.name.toLowerCase();

    let slides: Array<{ block_type: string; content: Record<string, unknown> }>;
    let themeData: Record<string, string> | null = null;

    if (mode === "ai") {
      // AI Reimagine mode — extract all text, let AI restructure
      let fileText = await extractAllText(fileBytes, lower);
      // If PDF extraction got very little, try AI-assisted extraction
      if (lower.endsWith(".pdf") && (!fileText || fileText.trim().length < 30)) {
        fileText = await aiExtractPdfText(fileBytes, title);
      }
      if (!fileText || fileText.trim().length < 10) {
        throw new Error("Could not extract meaningful text. Try faithful import instead.");
      }
      slides = await generateSlidesWithAI(fileText, title);
    } else if (lower.endsWith(".pptx")) {
      // Faithful import for PPTX — slide-by-slide
      const result = await faithfulPptxImport(fileBytes, supabase, user.id);
      slides = result.slides;
      themeData = result.theme;
    } else if (lower.endsWith(".pdf")) {
      // Faithful import for PDF — try text extraction, fall back to AI
      let fileText = await extractAllText(fileBytes, lower);
      if (!fileText || fileText.trim().length < 30) {
        fileText = await aiExtractPdfText(fileBytes, title);
      }
      if (!fileText || fileText.trim().length < 10) {
        throw new Error("This PDF appears to be image-based or encrypted. Try AI Reimagine mode.");
      }
      slides = extractSlidesFromText(fileText, title);
    } else {
      // Faithful import for other formats — extract text, split into slides
      const fileText = await extractAllText(fileBytes, lower);
      slides = extractSlidesFromText(fileText, title);
    }

    // Create presentation with theme if extracted
    const presInsert: Record<string, unknown> = { user_id: user.id, title, goal: "Imported" };
    if (themeData) {
      presInsert.theme = themeData;
    }

    const { data: pres, error: presErr } = await supabase
      .from("presentations")
      .insert(presInsert)
      .select()
      .single();
    if (presErr) throw presErr;

    // Sanitize content to remove null bytes that Postgres can't store
    const sanitize = (obj: unknown): unknown => {
      if (typeof obj === "string") return obj.replace(/\u0000/g, "");
      if (Array.isArray(obj)) return obj.map(sanitize);
      if (obj && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) result[k] = sanitize(v);
        return result;
      }
      return obj;
    };

    const slideRows = slides.map((s, i) => ({
      presentation_id: pres.id,
      user_id: user.id,
      block_type: s.block_type,
      content: sanitize(s.content),
      sort_order: i,
    }));

    const { error: slideErr } = await supabase.from("slides").insert(slideRows);
    if (slideErr) throw slideErr;

    return new Response(
      JSON.stringify({ id: pres.id, title, slideCount: slides.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ──────────────────────────────────────────────
// Faithful PPTX Import — slide-by-slide
// ──────────────────────────────────────────────

async function faithfulPptxImport(
  buffer: ArrayBuffer,
  supabase: any,
  userId: string
) {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Extract theme colors
  const theme = await extractPptxTheme(zip);

  // 2. Extract images and upload to storage
  const imageMap = await extractAndUploadImages(zip, supabase, userId);

  // 3. Extract slides in order
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
      const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
      return numA - numB;
    });

  // 4. Extract slide-to-image relationships and hyperlinks
  const slideImageMap = await buildSlideImageMap(zip, slideFiles, imageMap);
  const slideHyperlinkMap = await buildSlideHyperlinkMap(zip, slideFiles);

  const slides: Array<{ block_type: string; content: Record<string, unknown> }> = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const xml = await zip.files[slidePath].async("text");
    const slideContent = parseSingleSlideXml(xml, i, slideImageMap[slidePath], slideHyperlinkMap[slidePath]);
    slides.push(slideContent);
  }

  return { slides, theme };
}

function parseSingleSlideXml(
  xml: string,
  index: number,
  imageUrl?: string,
  hyperlinks?: Map<string, string>
): { block_type: string; content: Record<string, unknown> } {
  // Extract all text runs grouped by shape (text frame), preserving hyperlinks
  const shapes: string[][] = [];
  const spRegex = /<p:sp[\s>]([\s\S]*?)<\/p:sp>/g;
  let spMatch;

  while ((spMatch = spRegex.exec(xml)) !== null) {
    const spXml = spMatch[1];
    const texts: string[] = [];
    // Process paragraph by paragraph to catch hyperlinks
    const paraRegex = /<a:p>([\s\S]*?)<\/a:p>/g;
    let paraMatch;
    while ((paraMatch = paraRegex.exec(spXml)) !== null) {
      const paraXml = paraMatch[1];
      let paraText = "";
      // Process each run (<a:r>) — check for hyperlink reference
      const runRegex = /<a:r>([\s\S]*?)<\/a:r>/g;
      let runMatch;
      while ((runMatch = runRegex.exec(paraXml)) !== null) {
        const runXml = runMatch[1];
        const textMatch = runXml.match(/<a:t>([^<]*)<\/a:t>/);
        const text = textMatch?.[1] || "";
        if (!text.trim()) continue;
        // Check if this run has a hyperlink
        const hlinkMatch = runXml.match(/<a:hlinkClick[^>]*r:id="([^"]+)"/);
        if (hlinkMatch && hyperlinks?.has(hlinkMatch[1])) {
          const url = hyperlinks.get(hlinkMatch[1])!;
          paraText += `[${text.trim()}](${url})`;
        } else {
          paraText += text.trim();
        }
      }
      if (paraText.trim()) texts.push(paraText.trim());
    }
    if (texts.length > 0) shapes.push(texts);
  }

  // Classify the slide based on content structure
  const allText = shapes.map((s) => s.join(" "));

  if (index === 0 || shapes.length <= 2) {
    // Title slide
    return {
      block_type: "title",
      content: {
        heading: allText[0] || "Untitled",
        subheading: allText.slice(1).join(" ") || "",
        layout: "center",
        ...(imageUrl ? { imageUrl } : {}),
      },
    };
  }

  // Check if it looks like bullet points (many short text items in one shape)
  const longestShape = shapes.reduce((a, b) => (a.length > b.length ? a : b), []);
  if (longestShape.length >= 3) {
    return {
      block_type: "story",
      content: {
        heading: allText[0] || `Slide ${index + 1}`,
        body: longestShape.length > 1
          ? longestShape.map((t) => `• ${t}`).join("\n")
          : allText.slice(1).join("\n"),
        layout: "left",
        ...(imageUrl ? { imageUrl } : {}),
      },
    };
  }

  // Default: story with all text
  return {
    block_type: "story",
    content: {
      heading: allText[0] || `Slide ${index + 1}`,
      body: allText.slice(1).join("\n") || "",
      layout: "left",
      ...(imageUrl ? { imageUrl } : {}),
    },
  };
}

async function extractPptxTheme(zip: JSZip): Promise<Record<string, string> | null> {
  // Try to find theme XML
  const themeFile = Object.keys(zip.files).find((name) =>
    /^ppt\/theme\/theme\d*\.xml$/i.test(name)
  );
  if (!themeFile) return null;

  try {
    const xml = await zip.files[themeFile].async("text");

    // Extract color scheme
    const colors: Record<string, string> = {};
    const colorNames = ["dk1", "dk2", "lt1", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];

    for (const name of colorNames) {
      // Match <a:dk1><a:srgbClr val="000000"/></a:dk1> or <a:sysClr lastClr="..."/>
      const regex = new RegExp(`<a:${name}>[\\s\\S]*?(?:<a:srgbClr val="([A-Fa-f0-9]{6})"|<a:sysClr[^>]*lastClr="([A-Fa-f0-9]{6})")`, "i");
      const match = xml.match(regex);
      const hex = match?.[1] || match?.[2];
      if (hex) colors[name] = `#${hex}`;
    }

    if (Object.keys(colors).length === 0) return null;

    // Map PPTX theme to PresentQ theme format
    return {
      bg: colors.lt1 || "#ffffff",
      fg: colors.dk1 || "#000000",
      primary: colors.accent1 || "#3b82f6",
      secondary: colors.lt2 || "#f1f5f9",
      muted: colors.dk2 || "#64748b",
      headingFont: "Inter",
      bodyFont: "Inter",
    };
  } catch (e) {
    console.error("Theme extraction failed:", e);
    return null;
  }
}

async function extractAndUploadImages(
  zip: JSZip,
  supabase: any,
  userId: string
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const mediaFiles = Object.keys(zip.files).filter((name) =>
    /^ppt\/media\//i.test(name) && /\.(png|jpg|jpeg|gif|svg|webp|emf|wmf)$/i.test(name)
  );

  for (const mediaPath of mediaFiles) {
    try {
      const data = await zip.files[mediaPath].async("uint8array");
      const ext = mediaPath.split(".").pop()?.toLowerCase() || "png";

      // Skip EMF/WMF as they're not web-compatible
      if (ext === "emf" || ext === "wmf") continue;

      const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;
      const contentType = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;

      const { error } = await supabase.storage
        .from("slide-assets")
        .upload(fileName, data, { contentType, upsert: false });

      if (!error) {
        const { data: urlData } = supabase.storage
          .from("slide-assets")
          .getPublicUrl(fileName);
        // Map the original media filename to the public URL
        const mediaName = mediaPath.split("/").pop()!;
        imageMap.set(mediaName, urlData.publicUrl);
      }
    } catch (e) {
      console.error(`Failed to upload image ${mediaPath}:`, e);
    }
  }

  return imageMap;
}

async function buildSlideImageMap(
  zip: JSZip,
  slideFiles: string[],
  imageMap: Map<string, string>
): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};

  for (const slidePath of slideFiles) {
    // Find the relationship file for this slide
    const slideNum = slidePath.match(/slide(\d+)/i)?.[1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;

    if (!zip.files[relsPath]) continue;

    try {
      const relsXml = await zip.files[relsPath].async("text");

      // Find image relationships
      const relRegex = /Target="\.\.\/media\/([^"]+)"/g;
      let relMatch;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        const mediaName = relMatch[1];
        if (imageMap.has(mediaName)) {
          result[slidePath] = imageMap.get(mediaName);
          break; // Use the first image found per slide
        }
      }
    } catch (e) {
      // Skip if rels file can't be read
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Hyperlink extraction from .rels files
// ──────────────────────────────────────────────

async function buildSlideHyperlinkMap(
  zip: JSZip,
  slideFiles: string[]
): Promise<Record<string, Map<string, string>>> {
  const result: Record<string, Map<string, string>> = {};

  for (const slidePath of slideFiles) {
    const slideNum = slidePath.match(/slide(\d+)/i)?.[1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;

    if (!zip.files[relsPath]) continue;

    try {
      const relsXml = await zip.files[relsPath].async("text");
      const linkMap = new Map<string, string>();

      // Match external hyperlink relationships
      const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Type="[^"]*hyperlink"[^>]*Target="([^"]+)"[^>]*\/>/g;
      let relMatch;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        linkMap.set(relMatch[1], relMatch[2]);
      }
      // Also try reversed attribute order
      const relRegex2 = /<Relationship[^>]*Target="([^"]+)"[^>]*Type="[^"]*hyperlink"[^>]*Id="([^"]+)"[^>]*\/>/g;
      while ((relMatch = relRegex2.exec(relsXml)) !== null) {
        linkMap.set(relMatch[2], relMatch[1]);
      }

      if (linkMap.size > 0) {
        result[slidePath] = linkMap;
      }
    } catch (e) {
      // Skip
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Text extraction (for AI mode and non-PPTX faithful)
// ──────────────────────────────────────────────

async function extractAllText(buffer: ArrayBuffer, filename: string): Promise<string> {
  const bytes = new Uint8Array(buffer);

  if (filename.endsWith(".txt") || filename.endsWith(".md")) {
    return new TextDecoder().decode(bytes);
  }

  if (filename.endsWith(".pdf")) {
    return extractTextFromPDF(bytes);
  }

  if (filename.endsWith(".pptx")) {
    return await extractTextFromPPTX(buffer);
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function extractTextFromPDF(bytes: Uint8Array): string {
  // Try multiple extraction strategies for maximum compatibility
  const raw = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  const textParts: string[] = [];

  // Strategy 1: BT/ET blocks (standard uncompressed text)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Match parenthesized strings
    const strRegex = /\(([^)]*)\)/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const text = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (text.trim()) textParts.push(text.trim());
    }
    // Match hex strings <...>
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g;
    let hexMatch;
    while ((hexMatch = hexRegex.exec(block)) !== null) {
      const hex = hexMatch[1].replace(/\s/g, "");
      if (hex.length >= 4) {
        let decoded = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          if (code >= 32 && code < 127) decoded += String.fromCharCode(code);
        }
        if (decoded.trim()) textParts.push(decoded.trim());
      }
    }
  }

  // Strategy 2: Try to find readable ASCII text sequences if BT/ET failed
  if (textParts.join("").trim().length < 20) {
    // Look for text in stream objects after FlateDecode — we can't decompress,
    // but try to find any uncompressed readable segments
    const readableRegex = /([A-Za-z][A-Za-z0-9 ,.'":;!?\-()]{15,})/g;
    const seenTexts = new Set<string>();
    let readMatch;
    while ((readMatch = readableRegex.exec(raw)) !== null) {
      const t = readMatch[1].trim();
      // Filter out PDF internal keywords
      if (t.match(/^(endobj|endstream|stream|obj|xref|trailer|startxref)/i)) continue;
      if (t.match(/^\d+ \d+ obj/)) continue;
      if (t.includes("/Type") || t.includes("/Font") || t.includes("/Page")) continue;
      if (!seenTexts.has(t)) {
        seenTexts.add(t);
        textParts.push(t);
      }
    }
  }

  return textParts.join("\n");
}

async function extractTextFromPPTX(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const texts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
      const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
      return numA - numB;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const slideTexts: string[] = [];
    const tagRegex = /<a:t>([^<]*)<\/a:t>/g;
    let match;
    while ((match = tagRegex.exec(xml)) !== null) {
      if (match[1].trim()) slideTexts.push(match[1].trim());
    }
    if (slideTexts.length > 0) {
      texts.push(slideTexts.join(" "));
    }
  }

  return texts.join("\n\n");
}

// ──────────────────────────────────────────────
// AI Reimagine mode
// ──────────────────────────────────────────────

async function generateSlidesWithAI(text: string, title: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("AI not configured");

  const truncated = text.slice(0, 12000);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a presentation architect. Given extracted text from an uploaded document, create a structured slide deck.

Output ONLY a JSON array of slide objects. Each slide must have:
- "block_type": one of "title", "story", "framework", "data", "cta", "quote", "comparison", "testimonial"
- "content": object with fields appropriate for the block type:
  - title: { heading, subheading, layout: "center" }
  - story: { heading, body, layout: "left" }
  - framework: { heading, steps: [...], layout: "columns" }
  - data: { heading, metric, description, layout: "center" }
  - cta: { heading, body, buttonText, layout: "center" }
  - quote: { quote, attribution, layout: "center" }
  - comparison: { heading, left: { title, points: [...] }, right: { title, points: [...] }, layout: "split" }

Create as many slides as needed to cover all the content (up to 30). Start with a title slide. Use the document content to fill in real information, not placeholders.

Respond with ONLY the JSON array, no markdown fences, no explanation.`,
        },
        {
          role: "user",
          content: `Document title: "${title}"\n\nExtracted content:\n${truncated}`,
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    throw new Error("AI generation failed. Try faithful import instead.");
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "[]";

  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    const slides = JSON.parse(cleaned);
    if (Array.isArray(slides) && slides.length > 0) return slides;
  } catch (e) {
    console.error("Failed to parse AI slides:", e, cleaned.slice(0, 500));
  }

  throw new Error("AI could not generate slides from this document. Try faithful import instead.");
}

// ──────────────────────────────────────────────
// Text-only fallback for non-PPTX
// ──────────────────────────────────────────────

function extractSlidesFromText(text: string, title: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  const slides: Array<{ block_type: string; content: Record<string, unknown> }> = [];

  slides.push({
    block_type: "title",
    content: { heading: title, subheading: "Imported presentation", layout: "center" },
  });

  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const heading = chunk[0].slice(0, 80);
    const body = chunk.slice(1).join("\n");

    slides.push({
      block_type: "story",
      content: { heading, body: body || heading, layout: "left" },
    });
  }

  return slides.slice(0, 40);
}

// ──────────────────────────────────────────────
// AI-assisted PDF text extraction fallback
// ──────────────────────────────────────────────

async function aiExtractPdfText(buffer: ArrayBuffer, title: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "";

  // Convert PDF bytes to base64 for sending to AI
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Use Gemini which supports PDF input
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Extract ALL text content from this PDF document. Preserve the structure: headings, bullet points, paragraphs. Output ONLY the extracted text, no commentary.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract all text from this PDF titled "${title}":` },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      console.error("AI PDF extraction failed:", response.status);
      return "";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("AI PDF extraction error:", e);
    return "";
  }
}
