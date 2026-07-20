# Attachment Support Matrix

Single shared contract for Ask Atlas and Workspace. Enforced in
`artifacts/atlas-frontend/src/lib/attachments/supportMatrix.ts` and
`artifacts/api-server/src/lib/attachmentClassify.ts`.

Send-turn extraction for Office/CSV lives in
`artifacts/api-server/src/services/attachmentExtract/` and is wired through
`resolveAttachmentIdsForModel` so extracted text (and optional slide PNGs)
reach the model in the same turn.

## Direct model use (`processingStatus = understood` / `capability = model_use`)

| Type | Extensions | Notes |
|---|---|---|
| PNG | `.png` | Image block |
| JPG/JPEG | `.jpg`, `.jpeg` | Image block |
| WEBP | `.webp` | Image block |
| PDF | `.pdf` | Document block |
| TXT | `.txt` | UTF-8 text |
| Markdown | `.md`, `.markdown` | UTF-8 text |
| DOCX | `.docx` | Extracted paragraphs + headings as text |
| PPTX | `.pptx` | Per-slide text + speaker notes; optional slide PNGs (cap 20 slides / 8 images) |
| XLSX | `.xlsx` | Sheet markdown tables (cap ~200 rows/sheet) |
| CSV | `.csv` | Markdown table (cap ~200 rows) |

If extraction fails at send-turn, that attachment row is downgraded to
`processingStatus = failed` and an `attachment_unsupported` activity verb is
emitted — never silently dropped. Oversized decks still inject the first 20
slides and emit `attachment_unsupported` with
`reason: "deck too large — first 20 slides analyzed"`.

Per-turn injection budget: ~500 KB extracted text + 8 image blocks (longest
text truncated first).

## Upload / storage only (`processingStatus = unsupported` / `capability = storage_only`)

Stored and shown as chips. **Never claim the model understood these.**

| Type | Extensions |
|---|---|
| ZIP | `.zip` |

## Limits (shared config)

| Limit | Value |
|---|---|
| Max files per message | 10 |
| Max bytes per file | 20 MB |
| Max total bytes per message | 50 MB |
| Max extracted text per turn | 500 KB |
| Max extracted image blocks per turn | 8 |
| Max PPTX slides analyzed | 20 |
| Max spreadsheet rows per sheet | 200 |

## Shared stack

1. `useStagedAttachments` — staging, validation, upload progress, retry
2. `uploadService` / `/api/attachments/*` — request-upload → PUT → finalize
3. `useAtlasConversation.submit` → `{ text, attachmentIds }`
4. `resolveAttachmentIdsForModel` → download + extract (when needed) → model parts
5. `AttachmentStrip` — staged + sent renderer
