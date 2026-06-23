import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sha1Hex(data: string): string {
  const encoder = new TextEncoder();
  const hashBuffer = new Uint8Array(20);
  // Use SubtleCrypto for SHA-1
  // We'll do a sync approach with a helper
  return "";
}

async function generateSignature(params: Record<string, string>, apiSecret: string): Promise<string> {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const toSign = sorted + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(toSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      throw new Error("Cloudinary credentials not configured");
    }

    // Verify user
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = req.headers.get("content-type") || "";

    let fileBase64: string;
    let folder: string;
    let publicId: string | undefined;

    if (contentType.includes("application/json")) {
      // Accept base64-encoded image in JSON body (from AI generation)
      const body = await req.json();
      fileBase64 = body.base64;
      folder = body.folder || `presentq/${user.id}`;
      publicId = body.public_id;
      if (!fileBase64) {
        return new Response(JSON.stringify({ error: "base64 field required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Ensure data URI prefix
      if (!fileBase64.startsWith("data:")) {
        fileBase64 = `data:image/png;base64,${fileBase64}`;
      }
    } else {
      // Multipart form upload
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      folder = (formData.get("folder") as string) || `presentq/${user.id}`;
      publicId = (formData.get("public_id") as string) || undefined;
      if (!file) {
        return new Response(JSON.stringify({ error: "file field required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const arrayBuf = await file.arrayBuffer();
      const b64 = base64Encode(new Uint8Array(arrayBuf));
      const mime = file.type || "image/png";
      fileBase64 = `data:${mime};base64,${b64}`;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signParams: Record<string, string> = {
      folder,
      timestamp,
    };
    if (publicId) signParams.public_id = publicId;

    const signature = await generateSignature(signParams, API_SECRET);

    // Upload to Cloudinary
    const uploadForm = new FormData();
    uploadForm.append("file", fileBase64);
    uploadForm.append("folder", folder);
    uploadForm.append("timestamp", timestamp);
    uploadForm.append("api_key", API_KEY);
    uploadForm.append("signature", signature);
    if (publicId) uploadForm.append("public_id", publicId);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: "POST", body: uploadForm }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Cloudinary upload error:", uploadRes.status, errText);
      throw new Error(`Cloudinary upload failed: ${uploadRes.status}`);
    }

    const result = await uploadRes.json();

    return new Response(
      JSON.stringify({
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("cloudinary-upload error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
