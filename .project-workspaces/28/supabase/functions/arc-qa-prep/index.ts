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

    const { slides, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const slideSummary = slides.map(
      (s: { block_type: string; content: Record<string, unknown>; notes?: string }, i: number) =>
        `Slide ${i + 1} (${s.block_type}): ${JSON.stringify(s.content)}${s.notes ? `\nNotes: ${s.notes}` : ""}`
    ).join("\n\n");

    let systemPrompt: string;

    if (mode === "qa") {
      systemPrompt = `You are a presentation coach. Analyze the presentation slides below and predict 5-8 likely audience questions. For each question, provide a suggested answer.

Return JSON using this exact tool schema.`;
    } else {
      systemPrompt = `You are a presentation coach. For each slide below, generate 2-3 concise talking points that help the speaker remember key things to say. Also add a delivery tip (e.g., "pause here", "make eye contact", "emphasize this word").

Return JSON using this exact tool schema.`;
    }

    const tools = mode === "qa" ? [
      {
        type: "function",
        function: {
          name: "qa_predictions",
          description: "Return predicted audience questions with suggested answers",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    suggested_answer: { type: "string" },
                  },
                  required: ["question", "difficulty", "suggested_answer"],
                  additionalProperties: false,
                },
              },
            },
            required: ["questions"],
            additionalProperties: false,
          },
        },
      },
    ] : [
      {
        type: "function",
        function: {
          name: "confidence_prompts",
          description: "Return per-slide talking points and delivery tips",
          parameters: {
            type: "object",
            properties: {
              slides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    slide_number: { type: "number" },
                    talking_points: { type: "array", items: { type: "string" } },
                    delivery_tip: { type: "string" },
                  },
                  required: ["slide_number", "talking_points", "delivery_tip"],
                  additionalProperties: false,
                },
              },
            },
            required: ["slides"],
            additionalProperties: false,
          },
        },
      },
    ];

    const toolChoice = mode === "qa"
      ? { type: "function", function: { name: "qa_predictions" } }
      : { type: "function", function: { name: "confidence_prompts" } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here are my presentation slides:\n\n${slideSummary}` },
        ],
        tools,
        tool_choice: toolChoice,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("arc-qa-prep error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
