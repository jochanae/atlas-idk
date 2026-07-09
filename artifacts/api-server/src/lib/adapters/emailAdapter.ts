// Email delivery adapter — sends a draft_email artifact via Resend.
import { Resend } from "resend";
import { registerDeliveryAdapter, type DeliveryAdapter } from "../deliveryEngine";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits the draft body's "Subject: ..." first line from the rest, if present. */
function splitSubjectAndBody(body: string, fallbackTitle: string): { subject: string; text: string } {
  const lines = body.split("\n");
  const first = lines[0]?.trim() ?? "";
  const match = first.match(/^subject:\s*(.+)$/i);
  if (match) {
    return { subject: match[1].trim(), text: lines.slice(1).join("\n").trim() };
  }
  return { subject: fallbackTitle, text: body };
}

const emailAdapter: DeliveryAdapter = {
  provider: "email",
  label: "Send Email",
  validateTarget(target) {
    const to = typeof target.to === "string" ? target.to.trim() : "";
    if (!to || !EMAIL_RE.test(to)) {
      throw new Error("A valid recipient email address is required");
    }
    return { to };
  },
  async send(target, context) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Email delivery is not configured (missing RESEND_API_KEY)");
    }
    const body = typeof context.preview.body === "string" ? context.preview.body : "";
    const { subject, text } = splitSubjectAndBody(body, context.title);

    const resend = new Resend(apiKey);
    const fromAddress = process.env.RESEND_FROM_EMAIL || "Axiom <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [target.to as string],
      subject,
      text,
    });

    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }

    return { externalRef: { emailId: data?.id ?? null, to: target.to, subject } };
  },
};

registerDeliveryAdapter(emailAdapter);
