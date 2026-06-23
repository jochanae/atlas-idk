import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateSignature(params: Record<string, string>, apiSecret: string): Promise<string> {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const data = new TextEncoder().encode(sorted + apiSecret);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const CLD_API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const CLD_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!CLOUD_NAME || !CLD_API_KEY || !CLD_API_SECRET) throw new Error("Cloudinary credentials not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, slideId } = await req.json();
    if (!prompt || !slideId) {
      return new Response(JSON.stringify({ error: "prompt and slideId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate image via Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{
          role: "user",
          content: `Generate a professional, clean presentation slide image for: ${prompt}. The image should be 16:9 aspect ratio, suitable for a business presentation. High quality, modern design.`,
        }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI image generation failed");
    }

    const aiData = await aiResponse.json();
    const imageDataUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) throw new Error("No image returned from AI");

    // Upload to Cloudinary instead of Supabase storage
    const base64Data = imageDataUrl.startsWith("data:")
      ? imageDataUrl
      : `data:image/png;base64,${imageDataUrl}`;

    const folder = `presentq/${user.id}`;
    const publicId = `slide-${slideId}-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signParams: Record<string, string> = { folder, public_id: publicId, timestamp };
    const signature = await generateSignature(signParams, CLD_API_SECRET);

    const uploadForm = new FormData();
    uploadForm.append("file", base64Data);
    uploadForm.append("folder", folder);
    uploadForm.append("public_id", publicId);
    uploadForm.append("timestamp", timestamp);
    uploadForm.append("api_key", CLD_API_KEY);
    uploadForm.append("signature", signature);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: "POST", body: uploadForm }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Cloudinary upload error:", uploadRes.status, errText);
      throw new Error("Cloudinary upload failed");
    }

    const result = await uploadRes.json();

    return new Response(JSON.stringify({
      imageUrl: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-slide-image error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
