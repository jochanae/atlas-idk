import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { currentBlockType, targetBlockType, content } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const contentStr = JSON.stringify(content);

    const blockSchemas: Record<string, string> = {
      title: '{"heading":"string","subheading":"string","layout":"center"}',
      story: '{"heading":"string","body":"string","layout":"left"}',
      framework: '{"heading":"string","steps":["string"],"layout":"columns"}',
      data: '{"heading":"string","metric":"string","description":"string","layout":"center"}',
      cta: '{"heading":"string","body":"string","buttonText":"string","layout":"center"}',
      quote: '{"quote":"string","attribution":"string","layout":"center"}',
      comparison: '{"heading":"string","left":{"title":"string","points":["string"]},"right":{"title":"string","points":["string"]},"layout":"split"}',
      testimonial: '{"quote":"string","name":"string","role":"string","layout":"center"}',
      video: '{"heading":"string","videoUrl":"string","layout":"center"}',
      chart: '{"heading":"string","chartType":"bar","chartData":[{"label":"string","value":0}],"layout":"center"}',
      table: '{"heading":"string","tableHeaders":["string"],"tableRows":[["string"]],"layout":"center"}',
    };

    const targetSchema = blockSchemas[targetBlockType] || blockSchemas.title;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You convert presentation slide content from one block type to another. 
Preserve the core message and meaning. Adapt the content intelligently to fit the target format.
Return ONLY valid JSON matching the target schema. No markdown, no explanation.`,
          },
          {
            role: "user",
            content: `Convert this "${currentBlockType}" slide to a "${targetBlockType}" slide.

Current content: ${contentStr}

Target schema: ${targetSchema}

Return ONLY the JSON content object for the new "${targetBlockType}" slide. Preserve any imageUrl if present.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content || "";
    raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const newContent = JSON.parse(raw);
    if (content.imageUrl && !newContent.imageUrl) {
      newContent.imageUrl = content.imageUrl;
    }

    return new Response(JSON.stringify({ blockType: targetBlockType, content: newContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("remix-slide-type error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
