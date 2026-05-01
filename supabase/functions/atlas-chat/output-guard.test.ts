import { assertEquals } from "https://deno.land/std@0.208.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.208.0/assert/assert.ts";
import { validateOutput, type ValidationResult } from "../_shared/output-guard.ts";

// ── BUILD mode tests ───────────────────────────────────────

Deno.test("BUILD: passes clean code response", () => {
  const text = "Here's the login component:\n\n```tsx\nexport function Login() {\n  return <form><input name='email' /><button>Sign in</button></form>;\n}\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, true);
});

Deno.test("BUILD: catches TODO placeholder in code", () => {
  const text = "```ts\nfunction handler() {\n  // TODO: implement this\n  return null;\n}\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "placeholder_in_code");
});

Deno.test("BUILD: catches '// ...' placeholder", () => {
  const text = "```ts\nfunction handler() {\n  // ...\n}\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "placeholder_in_code");
});

Deno.test("BUILD: catches [insert X here] placeholder", () => {
  const text = "```ts\nconst apiKey = '[insert your key here]';\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "placeholder_in_code");
});

Deno.test("BUILD: catches FIXME placeholder", () => {
  const text = "```ts\n// FIXME broken\nconst x = 1;\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "placeholder_in_code");
});

Deno.test("BUILD: catches lorem ipsum placeholder", () => {
  const text = "```html\n<p>Lorem ipsum dolor sit amet</p>\n```";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "placeholder_in_code");
});

Deno.test("BUILD: catches capability denial", () => {
  const text = "I cannot write code for you, but here's a general outline of what you need to do to build a login page...";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "capability_denial");
});

Deno.test("BUILD: catches 'I'm just an AI' denial", () => {
  const text = "I'm just an AI and cannot generate production code, but I can explain the concepts behind authentication.";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "capability_denial");
});

Deno.test("BUILD: catches 'as a large language model' filler", () => {
  const text = "As a large language model, I can help you think through the architecture but let me provide a high-level overview.";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "capability_denial");
});

Deno.test("BUILD: catches rambling without artifact", () => {
  // Generate a long prose response with no code blocks
  const words = Array(850).fill("word").join(" ");
  const text = `Let me explain how you could approach this. ${words}`;
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "build_without_artifact");
});

Deno.test("BUILD: passes long response WITH code blocks", () => {
  const prose = Array(850).fill("word").join(" ");
  const text = `${prose}\n\n\`\`\`ts\nconsole.log("real code");\n\`\`\``;
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, true);
});

// ── THINK mode tests ───────────────────────────────────────

Deno.test("THINK: passes normal exploratory response", () => {
  const text = "Two directions here. You could use a monorepo with shared packages, or keep them as separate repos with a shared npm package. The monorepo is faster to iterate on but harder to deploy independently.";
  const result = validateOutput(text, "THINK");
  assertEquals(result.valid, true);
});

Deno.test("THINK: catches rambling over 800 words", () => {
  const words = Array(850).fill("thought").join(" ");
  const result = validateOutput(words, "THINK");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "think_rambling");
});

Deno.test("THINK: catches empty response", () => {
  const result = validateOutput("Ok", "THINK");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "empty_response");
});

Deno.test("THINK: passes 'Done.' as valid", () => {
  const result = validateOutput("Done.", "THINK");
  assertEquals(result.valid, true);
});

// ── DECIDE mode tests ──────────────────────────────────────

Deno.test("DECIDE: passes response with trade-offs and recommendation", () => {
  const text = "Two options here. Option A uses server-side rendering — pro: better SEO, con: more complexity. Option B is a static SPA — simpler but weaker on SEO. I'd recommend Option A given your audience is search-dependent.";
  const result = validateOutput(text, "DECIDE");
  assertEquals(result.valid, true);
});

Deno.test("DECIDE: catches capability denial", () => {
  const text = "I cannot write code for this decision, but here is a general overview of the considerations.";
  const result = validateOutput(text, "DECIDE");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "capability_denial");
});

Deno.test("DECIDE: catches missing trade-offs in long response", () => {
  // A long DECIDE response that doesn't mention any trade-offs or recommendations
  const filler = Array(20).fill("There are many factors at play here and we need to look at the full picture carefully before moving forward.").join(" ");
  const result = validateOutput(filler, "DECIDE");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "decide_no_tradeoffs");
});

Deno.test("DECIDE: catches rambling over 800 words", () => {
  const words = Array(850).fill("option").join(" ");
  const text = `Here are your options. ${words}`;
  const result = validateOutput(text, "DECIDE");
  assertEquals(result.valid, false);
  assertEquals(result.violation, "decide_rambling");
});

Deno.test("DECIDE: passes short response with recommendation keyword", () => {
  const text = "Go with Postgres. It fits your relational data model and you already know SQL.";
  const result = validateOutput(text, "DECIDE");
  assertEquals(result.valid, true);
});

// ── Edge cases ─────────────────────────────────────────────

Deno.test("empty input returns valid", () => {
  const result = validateOutput("", "BUILD");
  assertEquals(result.valid, true);
});

Deno.test("'Done.' always valid regardless of mode", () => {
  for (const mode of ["THINK", "BUILD", "DECIDE"] as const) {
    const result = validateOutput("Done.", mode);
    assertEquals(result.valid, true, `Failed for mode ${mode}`);
  }
});

Deno.test("correction prompt is present on failure", () => {
  const text = "I cannot write code for you.";
  const result = validateOutput(text, "BUILD");
  assertEquals(result.valid, false);
  assert(result.correction !== undefined && result.correction.length > 0);
});
