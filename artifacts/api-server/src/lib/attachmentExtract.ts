/**
 * attachmentExtract — thin compatibility shim over the send-turn extract service.
 *
 * Prefer `services/attachmentExtract` for new call sites. This keeps the Nexus
 * legacy inline-base64 pre-extract loop working.
 */
import {
  extractAttachment,
  detectExtractFormat,
} from "../services/attachmentExtract";

/**
 * Extract readable text from a base64-encoded OOXML/CSV file.
 * Returns `null` if the format is not supported or extraction fails.
 */
export async function extractOoxmlText(
  base64: string,
  filename: string,
): Promise<string | null> {
  const format = detectExtractFormat("", filename);
  if (!format) return null;

  try {
    const buf = Buffer.from(base64, "base64");
    const result = await extractAttachment(buf, "", filename);
    return result.text.trim() ? result.text : null;
  } catch {
    return null;
  }
}
