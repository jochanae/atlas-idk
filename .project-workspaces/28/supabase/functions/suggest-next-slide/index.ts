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

    const { slides } = await req.json();

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "slides array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const slidesSummary = slides.map((s: any, i: number) => {
      const content = s.content || {};
      const text = [content.heading, content.body, content.quote, content.subheading, content.description, content.metric, content.buttonText]
        .filter(Boolean)
        .join(" — ");
      return `Slide ${i + 1} (${s.block_type}): ${text || "(empty)"}`;
    }).join("\n");

    const blockTypesList = "title, story, framework, data, cta, quote, comparison, testimonial";

    const systemPrompt = `You are an expert presentation strategist. Given a sequence of presentation slides, suggest the BEST next slide to continue the narrative arc.

Available block types: ${blockTypesList}

Respond with a JSON object (no markdown fencing) with these exact fields:
- "block_type": one of the available types
- "reasoning": one sentence explaining why this slide should come next (max 20 words)
- "content": an object with the appropriate fields for that block type:
  - title: { heading, subheading, layout }
  - story: { heading, body, layout }
  - framework: { heading, steps (array of 3 strings), layout }
  - data: { heading, metric, description, layout }
  - cta: { heading, body, buttonText, layout }
  - quote: { quote, attribution, layout }
  - comparison: { heading, left: { title, points }, right: { title, points }, layout }
  - testimonial: { quote, name, role, layout }

Make content specific and relevant to the existing presentation narrative. Use "center" for layout.`;

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
            { role: "user", content: `Current slides:\n${slidesSummary}\n\nSuggest the next slide.` },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content?.trim() || "";
    raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    const suggestion = JSON.parse(raw);

    return new Response(
      JSON.stringify({ suggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("suggest-next-slide error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
