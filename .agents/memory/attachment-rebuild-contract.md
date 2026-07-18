---
name: Attachment Rebuild Contract
description: Architectural failures in the deleted attachment system; mandatory constraints for the rebuild. Includes live test evidence from screenshots.
---

# Architectural Failures (Deleted System)

Screenshots confirmed three concrete failures in the system that was deleted:

1. **Workspace sent inline base64 through the image renderer for PPTX files.** A `.pptx` was displayed with a broken image chip (`🖼 Reveal_Presentation (1).pptx`). The file was passed through an image-style renderer that cannot handle binary office formats. Atlas appeared to respond to it (probably ignored the payload silently or hallucinated).

2. **Workspace sent the legacy inline-base64 attachments payload even when `ATTACHMENTS_PERSISTENCE=true` was set.** This produced an HTTP 400: "Legacy attachments payload disabled. Use attachmentIds." The send path was not synchronized with the flag state — it fell through to the wrong branch.

3. **Ask Atlas and Workspace had completely separate send paths and separate attachment rendering components.** Ask Atlas rendered images visually; Workspace used a conflicting legacy payload structure. Neither surface knew about the other's contract. A user switching surfaces got different behavior, different errors, and different rendering.

# Live Test Evidence — Image Transport Divergence (2026-07-18)

Live screenshots of the same image sent on both surfaces confirmed that the inconsistency exists at the image transport and prompt layer — independent of, and predating, the deleted persistence system.

**Same image. Same session. Different surface.**

| Observation | Ask Atlas | Workspace |
|---|---|---|
| Image-only send allowed | ✅ Yes | ❌ No — requires co-present text |
| Image rendered inline in thread | ✅ Large inline preview | Not visible in screenshot |
| Model detail level | Dense: "Ad Hoc PAs", "11 JUN–19 JUL", "battery nearly dead", "11:27", "5G", "rotated sideways", asks "What's the third image?" | Surface: "phone lying on a dark surface", "Delta Airlines content page", "World Cup", "could be a foldable, possibly Z Fold 6" |
| Atlas asked a follow-up | ✅ Yes ("What's the third image?") | ❌ No |

**Likely causes of the detail gap (not confirmed, ranked by probability):**

1. **Image resolution/preprocessing difference.** `fileToBase64Safe` (Ask Atlas path, `lib/image-resize.ts`) preserves up to 7000px and only resamples above that. If Workspace sends via a different branch that adds compression or a lower dimension cap, the model receives fewer pixels and misses fine text like "Ad Hoc PAs" and the status bar.

2. **Different prompt wrapper and attention split.** Ask Atlas uses the concierge system prompt. Workspace injects full project DNA, repo tree, and build context. The model's attention is distributed across more material — less focused on the image.

3. **Different message construction / content array position.** The position of the image in the Anthropic content array, and what surrounds it, affects model prioritization.

**Key conclusion:** The inconsistency is not in persistence. It existed before that, at the image transport layer. The two surfaces used different image preprocessing, different send gates (image-only allowed vs. blocked), different prompt context, and likely different content array construction. Persistence made the inconsistency visible as hard errors. The underlying divergence was always there.

**The "What's the third image?" response** from Ask Atlas indicates the model received prior-turn context and interpreted the single image as part of a sequence — a conversation-context difference, not just an image-quality difference.

# Rebuild Contract (Mandatory)

The rebuilt system must implement **one shared attachment layer** used identically by both Ask Atlas and Workspace:

| Requirement | Detail |
|---|---|
| **One staged-file model** | Single data structure representing a staged file before send. Both surfaces read/write it identically. |
| **One outgoing attachment contract** | One request shape sent to the backend. No surface-specific payload variants. |
| **One send gate** | Image-only send either works on both surfaces or is blocked on both. The input contract does not change by surface. |
| **One image preprocessor** | Single `fileToBase64Safe`-equivalent used by both surfaces. Same resolution cap, same resampling logic, same output format. |
| **One file-type classifier** | Used for presentation only (icon, label, card type). Not for routing logic. |
| **One shared attachment renderer** | Single component renders all attachment card types. Both surfaces import it. |
| **One model-ingestion adapter** | One function converts staged files to the model's input format. Same content-array construction on both surfaces. |

## Renderer must explicitly support these card types:
- `image` — inline preview
- `pdf` — document icon + filename + page count if available
- `presentation` — slide icon + filename (pptx, key, odp)
- `document` — doc icon + filename (docx, doc, odt, rtf, txt)
- `spreadsheet` — grid icon + filename (xlsx, xls, csv, ods)
- `generic` — fallback file icon + filename + extension badge

## Hard rules:
1. **No non-image file may be passed through the image renderer.** The image renderer accepts only `image/*` MIME types. Any other MIME type must route to the appropriate card type above, and if the model cannot ingest that file type, an explicit error must be shown before send — not after, and not silently.
2. **One send gate.** If image-only is allowed, it is allowed on both surfaces. If text is required, it is required on both. Never let the surface determine this.
3. **One content-array builder.** The function that constructs the Anthropic/Gemini content array for a turn is shared. It is not reimplemented per surface.

**Why:** The deleted system's failures and the live-tested image-quality gap were both downstream of the same root: two surfaces that evolved independently and accumulated separate send paths, separate preprocessing, separate gates, and separate prompt wrappers for what is conceptually one operation — sending a message with content attached.
