# Attachment Support Matrix

Single shared contract for Ask Atlas and Workspace. Enforced in
`artifacts/atlas-frontend/src/lib/attachments/supportMatrix.ts` and
`artifacts/api-server/src/lib/attachmentClassify.ts`.

## Direct model use (`processingStatus = understood`)

| Type | Extensions | Notes |
|---|---|---|
| PNG | `.png` | Image block |
| JPG/JPEG | `.jpg`, `.jpeg` | Image block |
| WEBP | `.webp` | Image block |
| PDF | `.pdf` | Document block |
| TXT | `.txt` | UTF-8 text |
| Markdown | `.md`, `.markdown` | UTF-8 text |

## Upload / storage only (`processingStatus = unsupported`)

Stored and shown as chips. **Never claim the model understood these.**

| Type | Extensions |
|---|---|
| DOCX | `.docx` |
| PPTX | `.pptx` |
| XLSX | `.xlsx` |
| CSV | `.csv` |
| ZIP | `.zip` |

## Limits (shared config)

| Limit | Value |
|---|---|
| Max files per message | 10 |
| Max bytes per file | 20 MB |
| Max total bytes per message | 50 MB |

## Shared stack

1. `useStagedAttachments` — staging, validation, upload progress, retry
2. `uploadService` / `/api/attachments/*` — request-upload → PUT → finalize
3. `useAtlasConversation.submit` → `{ text, attachmentIds }`
4. `AttachmentStrip` — staged + sent renderer
