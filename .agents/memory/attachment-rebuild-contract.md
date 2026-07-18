---
name: Attachment Rebuild Contract
description: Architectural failures in the deleted attachment system; mandatory constraints for the rebuild.
---

# Architectural Failures (Deleted System)

Screenshots confirmed three concrete failures in the system that was deleted:

1. **Workspace sent inline base64 through the image renderer for PPTX files.** A `.pptx` was displayed with a broken image chip (`🖼 Reveal_Presentation (1).pptx`). The file was passed through an image-style renderer that cannot handle binary office formats. Atlas appeared to respond to it (probably ignored the payload silently or hallucinated).

2. **Workspace sent the legacy inline-base64 attachments payload even when `ATTACHMENTS_PERSISTENCE=true` was set.** This produced an HTTP 400: "Legacy attachments payload disabled. Use attachmentIds." The send path was not synchronized with the flag state — it fell through to the wrong branch.

3. **Ask Atlas and Workspace had completely separate send paths and separate attachment rendering components.** Ask Atlas rendered images visually; Workspace used a conflicting legacy payload structure. Neither surface knew about the other's contract. A user switching surfaces got different behavior, different errors, and different rendering.

# Rebuild Contract (Mandatory)

The rebuilt system must implement **one shared attachment layer** used identically by both Ask Atlas and Workspace:

| Requirement | Detail |
|---|---|
| **One staged-file model** | Single data structure representing a staged file before send. Both surfaces read/write it identically. |
| **One outgoing attachment contract** | One request shape sent to the backend. No surface-specific payload variants. |
| **One file-type classifier** | Used for presentation only (icon, label, card type). Not for routing logic. |
| **One shared attachment renderer** | Single component renders all attachment card types. Both surfaces import it. |
| **One model-ingestion adapter** | One function converts staged files to the model's input format. |

## Renderer must explicitly support these card types:
- `image` — inline preview
- `pdf` — document icon + filename + page count if available
- `presentation` — slide icon + filename (pptx, key, odp)
- `document` — doc icon + filename (docx, doc, odt, rtf, txt)
- `spreadsheet` — grid icon + filename (xlsx, xls, csv, ods)
- `generic` — fallback file icon + filename + extension badge

## Hard rule:
**No non-image file may be passed through the image renderer.** The image renderer accepts only `image/*` MIME types. Any other MIME type must route to the appropriate card type above, and if the model cannot ingest that file type, an explicit error must be shown before send — not after, and not silently.

**Why:** The deleted system's failures were all downstream of this single violation: treating a file picker selection as generically "an attachment" and letting it flow into whichever renderer existed, rather than classifying it first and blocking unsupported types early.
