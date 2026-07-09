---
name: IMAGE_GEN vs CHAT output-guard scrub
description: Why sketch/image requests could silently die with only acknowledgment text and no image — output-guard scrubbing tied to intent classification, not user intent.
---

The Output Guard in nexus.ts strips operational markers (IMAGE_GEN, FILE_EDIT, etc.) whenever the intent classifier labels a turn CHAT — but the classifier is fallible for capability-phrased requests ("Are you able to sketch...?"), which read as a question and get misclassified even when the model still emits IMAGE_GEN because the user explicitly asked for a visual. The result: a short acknowledgment sentence renders, then nothing — the image token was silently dropped with no user-visible explanation.

**Why:** image generation never mutates code/files and is always explicitly requested — unlike FILE_EDIT/GITHUB_PUSH, there's no safety reason to gate it on a fallible classifier guess. Scrubbing should instead be reserved for an explicit user opt-out (Just Talk / Conversation Mode).

**How to apply:** `scrubOperationalMarkersForChat` takes an options bag (`{ keepImageGen }`); callers should only scrub IMAGE_GEN when the user explicitly chose a no-tools mode, not merely because intent classification guessed CHAT. Apply the same reasoning if other low-risk, explicitly-requested, non-mutating tokens are added later — don't lump them in with mutation-risk tokens under one scrub condition.
