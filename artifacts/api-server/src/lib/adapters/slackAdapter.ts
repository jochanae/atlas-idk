// Slack delivery adapter — posts a draft_slack artifact to a Slack channel.
//
// Deliberately behind the same generic DeliveryAdapter contract as every other
// provider — Slack is NOT hardcoded into artifact generation anywhere. Today
// this uses a single static bot token (SLACK_BOT_TOKEN) wired to one
// development workspace. Per-user OAuth-based Slack connections will replace
// this token resolution later as part of the Connectors/MCP layer — only this
// file's `send`/token lookup should need to change when that lands.
import { WebClient } from "@slack/web-api";
import { registerDeliveryAdapter, type DeliveryAdapter } from "../deliveryEngine";

const slackAdapter: DeliveryAdapter = {
  provider: "slack",
  label: "Post to Slack",
  validateTarget(target) {
    const channel = typeof target.channel === "string" && target.channel.trim()
      ? target.channel.trim()
      : (process.env.SLACK_DEFAULT_CHANNEL_ID || "");
    if (!channel) {
      throw new Error("A Slack channel is required (none provided and no default configured)");
    }
    return { channel };
  },
  async send(target, context) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error("Slack delivery is not configured (missing SLACK_BOT_TOKEN)");
    }
    const body = typeof context.preview.body === "string" ? context.preview.body : context.title;

    const client = new WebClient(token);
    const result = await client.chat.postMessage({
      channel: target.channel as string,
      text: body,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error ?? "unknown"}`);
    }

    return { externalRef: { channel: result.channel ?? target.channel, ts: result.ts ?? null } };
  },
};

registerDeliveryAdapter(slackAdapter);
