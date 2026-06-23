import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Input validation: enforce payload size limit ---
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 500_000) {
      return new Response(JSON.stringify({ error: "Payload too large (max 500 KB)" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text : "";
    const hasImage = !!body.hasImage;
    const imageDescription = typeof body.imageDescription === "string" ? body.imageDescription : "";

    if (!text && !hasImage) {
      return new Response(
        JSON.stringify({ error: "Provide text or image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate text length
    if (text.length > 10_000) {
      return new Response(JSON.stringify({ error: "Text too long (max 10,000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Validate imageDescription length
    if (imageDescription.length > 2_000) {
      return new Response(JSON.stringify({ error: "Image description too long (max 2,000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userContent = [];
    if (text) userContent.push(`Voice note transcript: "${text}"`);
    if (hasImage) userContent.push(`The user also captured a photo: ${imageDescription || "photo from camera"}`);

    const systemPrompt = `You are an AI that converts quick captures (voice notes and/or photos) into presentation slides.

Given a voice note transcript and/or photo description, create ONE slide that best represents the captured idea.

Available block_types: title, story, framework, data, cta, quote, comparison, testimonial

Respond with a JSON object (no markdown fencing):
{
  "block_type": "story",
  "content": {
    "heading": "...",
    "body": "...",
    "layout": "center",
    "speaker_script": "..."
  }
}

Rules:
- Choose the block_type that best fits the content
- Write polished, presentation-ready text (not raw transcript)
- Include a speaker_script with delivery cues
- If it sounds like a data point, use "data" with a metric
- If it sounds like an idea/concept, use "story" or "framework"
- If it's a memorable phrase, use "quote"
- Always use "center" for layout`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent.join("\n") },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content?.trim() || "";
    raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    const slide = JSON.parse(raw);

    return new Response(
      JSON.stringify({ slide }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("quick-capture error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
