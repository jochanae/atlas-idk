import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { rehearsal_id, presentation_id, slides } = await req.json();

    // Build context for AI
    let context = "";

    // If we have a rehearsal recording, fetch its data
    if (rehearsal_id) {
      const { data: rehearsal } = await supabase
        .from("rehearsal_recordings")
        .select("*")
        .eq("id", rehearsal_id)
        .eq("user_id", user.id)
        .single();

      if (rehearsal) {
        context += `\n## Rehearsal Data\n`;
        context += `- Duration: ${rehearsal.duration_seconds} seconds\n`;
        context += `- Words per minute (average): ${rehearsal.wpm_average || "unknown"}\n`;
        context += `- Filler word count: ${rehearsal.filler_word_count || 0}\n`;
        if (rehearsal.slide_timings) {
          context += `- Slide timings: ${JSON.stringify(rehearsal.slide_timings)}\n`;
        }
        if (rehearsal.notes) {
          context += `- Speaker notes: ${rehearsal.notes}\n`;
        }
      }
    }

    // If slides are provided, add their content
    if (slides && slides.length > 0) {
      context += `\n## Slide Content\n`;
      slides.forEach((s: any, i: number) => {
        context += `Slide ${i + 1} (${s.block_type}): ${JSON.stringify(s.content)}\n`;
        if (s.notes) context += `  Notes: ${s.notes}\n`;
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert presentation coach. Analyze the rehearsal data and slide content provided, then return a structured coaching report. Be specific, actionable, and encouraging. Focus on practical improvements.`,
          },
          {
            role: "user",
            content: `Analyze this presentation rehearsal and generate a coaching report:\n${context}\n\nProvide your analysis.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "coaching_report",
              description: "Return a structured coaching report with scores and feedback.",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "A 2-3 sentence executive summary of the rehearsal performance.",
                  },
                  overall_score: {
                    type: "number",
                    description: "Score from 0-100 rating overall presentation quality.",
                  },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 specific strengths observed.",
                  },
                  improvements: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 specific areas for improvement with actionable tips.",
                  },
                  pacing_analysis: {
                    type: "object",
                    properties: {
                      rating: { type: "string", enum: ["too_fast", "good", "too_slow"] },
                      ideal_wpm: { type: "number" },
                      recommendation: { type: "string" },
                    },
                    required: ["rating", "ideal_wpm", "recommendation"],
                  },
                },
                required: ["summary", "overall_score", "strengths", "improvements", "pacing_analysis"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "coaching_report" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured response from AI");

    const report = JSON.parse(toolCall.function.arguments);

    // Save to database
    const { data: saved, error: saveErr } = await supabase
      .from("coaching_reports")
      .insert({
        user_id: user.id,
        rehearsal_id: rehearsal_id || null,
        presentation_id: presentation_id || null,
        summary: report.summary,
        overall_score: Math.round(report.overall_score),
        strengths: report.strengths,
        improvements: report.improvements,
        pacing_analysis: report.pacing_analysis,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Save error:", saveErr);
      throw new Error("Failed to save report");
    }

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-coaching-report error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
