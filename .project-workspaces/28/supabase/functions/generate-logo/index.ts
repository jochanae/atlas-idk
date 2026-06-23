import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, style, referenceImage, brandColors } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Style controls aesthetics ONLY (typography, texture, layout) — never colors
    const styleAesthetics: Record<string, string> = {
      "modern and minimal": "clean geometric shapes, minimal line work, modern sans-serif feel, ample negative space",
      "bold and geometric": "strong angular shapes, bold lines, impactful symmetry, heavy visual weight",
      "elegant and luxurious": "refined serif-inspired elements, metallic textures, sophisticated ornamental details, premium feel",
      "playful and colorful": "rounded organic shapes, friendly curves, dynamic composition, energetic feel",
      "retro vintage": "classic hand-drawn elements, retro typography feel, nostalgic textures, badge or emblem style",
      "tech and futuristic": "sharp edges, circuit-inspired patterns, holographic feel, forward-looking shapes",
    };
    const aestheticGuide = styleAesthetics[style || ""] || style || "clean and professional";

    // Color constraint — use brand colors if provided, otherwise let AI choose freely
    let colorConstraint = "";
    if (brandColors && typeof brandColors === "object") {
      const { primary, secondary, accent } = brandColors;
      const colorList = [primary, secondary, accent].filter(Boolean);
      if (colorList.length > 0) {
        colorConstraint = `\nStrict Color Constraint: Use ONLY these brand colors: ${colorList.join(", ")}. Do NOT use any other colors. Do NOT default to generic green, emerald, or standard gold unless those exact hex values are listed above.`;
      }
    }

    const userContent: any[] = [];

    if (referenceImage && typeof referenceImage === "string") {
      userContent.push({
        type: "text",
        text: `You are a precise logo editor. The user has uploaded their existing logo. Your job is to make ONLY the specific change they describe — nothing else.

CRITICAL RULES:
- Do NOT redesign, restyle, or reimagine the logo
- Do NOT add decorative elements, borders, frames, ornaments, or flourishes
- Do NOT change the font style, weight, or typeface unless explicitly asked
- Do NOT change colors unless explicitly asked
- Do NOT change the layout or composition unless explicitly asked
- Keep the EXACT same visual style, proportions, and aesthetic
- The output should look like the same logo with one small edit applied
- Render on a pure white background
- Output ONLY the image

The user's edit request: ${prompt}`,
      });
      userContent.push({
        type: "image_url",
        image_url: { url: referenceImage },
      });
    } else {
      userContent.push({
        type: "text",
        text: `You are a world-class logo designer. Generate a single, professional logo image based on the user's description. The logo should be:
- Clean vector-style artwork on a pure white background
- Aesthetics: ${aestheticGuide}
- Suitable for use as a brand mark at any size
- No text unless specifically requested
- High contrast and visually striking${colorConstraint}
Output ONLY the image, no text response.

Generate a logo for: ${prompt}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();

    const choice = result.choices?.[0];
    const images = choice?.message?.images;
    let imageBase64: string | null = null;
    let mimeType = "image/png";

    if (Array.isArray(images) && images.length > 0) {
      const dataUrl = images[0]?.image_url?.url;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const [header, b64] = dataUrl.split(",");
        mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
        imageBase64 = b64;
      }
    }

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(result).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return an image. Try a more descriptive prompt." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ image: imageBase64, mimeType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-logo error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
