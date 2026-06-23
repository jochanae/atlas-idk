import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const { script, coachingLevel, context } = await req.json();
    if (!script || typeof script !== "string") {
      return new Response(JSON.stringify({ error: "script is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isDetailed = coachingLevel === "detailed";

    const systemPrompt = isDetailed
      ? `You are Arc, an expert presentation delivery coach. Your job is to take a speaker's script and annotate it with detailed physical delivery cues.

Available cues (insert as inline markers):
[PAUSE] - brief pause for emphasis
[BREATHE] - take a breath, reset
[SLOW DOWN] - reduce speaking pace  
[EMPHASIZE] - stress this word/phrase
[LOOK UP] - make eye contact with audience
[STEP FORWARD] - move toward audience for impact
[LEAN IN] - lean toward audience, creates intimacy
[GESTURE — description] - specific hand/body gesture (e.g. [GESTURE — open palms], [GESTURE — count on fingers])
[EYE CONTACT] - lock eyes with someone in audience
[SCAN AUDIENCE] - sweep gaze across room
[LOWER VOICE] - drop volume for dramatic effect
[RAISE VOICE] - increase energy/volume
[SMILE] - genuine smile to connect
[POWER STANCE] - plant feet, shoulders back
[STEP BACK] - create space, let idea land
[DRAMATIC PAUSE] - longer silence for maximum impact

Rules:
1. Return the FULL script with cues inserted at the right moments
2. Add a cue every 1-3 sentences — don't over-mark but be thorough
3. Consider the emotional arc: build tension, release, climax
4. For personal stories, use [LEAN IN] and [LOWER VOICE]
5. For key points, use [STEP FORWARD] + [EMPHASIZE]
6. For transitions, use [PAUSE] + [SCAN AUDIENCE]
7. Open and close with strong physical presence ([POWER STANCE], [EYE CONTACT])
8. Add context-specific gestures (e.g. for numbers: [GESTURE — count on fingers])
9. Return ONLY the annotated script text, no extra commentary`
      : `You are Arc, a presentation coach. Annotate this script with basic delivery cues.

Available cues: [PAUSE], [BREATHE], [SLOW DOWN], [EMPHASIZE], [LOOK UP], [TRANSITION]

Rules:
1. Return the FULL script with cues inserted
2. Add a cue every 3-5 sentences — keep it light
3. Focus on pacing (PAUSE, BREATHE, SLOW DOWN) and emphasis
4. Return ONLY the annotated script text, no extra commentary`;

    const userPrompt = context
      ? `Context: ${context}\n\nScript:\n${script}`
      : `Script:\n${script}`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits needed" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const annotatedScript = data.choices?.[0]?.message?.content || script;

    return new Response(JSON.stringify({ annotatedScript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-script error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
