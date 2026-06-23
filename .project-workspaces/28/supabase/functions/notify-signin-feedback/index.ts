import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store as a bug report (allows anonymous inserts via RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    await supabase.from("bug_reports").insert({
      error_message: `[Sign-in feedback] ${name || "Anonymous"}${email ? ` (${email})` : ""}`,
      error_stack: message,
      page_url: "/auth",
      user_agent: req.headers.get("user-agent") || "unknown",
      status: "open",
    });

    // Send admin email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "PresentQ <noreply@presentq.app>",
          to: ["admin@presentq.app"],
          subject: `[PresentQ] Sign-in issue from ${name || "Anonymous"}`,
          html: `
            <h2>Sign-In Feedback</h2>
            <p><strong>Name:</strong> ${name || "Not provided"}</p>
            <p><strong>Email:</strong> ${email || "Not provided"}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left:3px solid #D4AF37;padding-left:12px;color:#555">${message}</blockquote>
          `,
        }),
      });
      const resBody = await res.text();
      console.log("Resend response:", res.status, resBody);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-signin-feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
