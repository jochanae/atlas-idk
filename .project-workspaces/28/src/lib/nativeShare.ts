import { toast } from "sonner";

/**
 * Use the native Web Share API when available (mobile),
 * fall back to clipboard copy on desktop.
 */
export async function nativeShare({
  title,
  text,
  url,
}: {
  title?: string;
  text?: string;
  url: string;
}): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return; // user completed or cancelled — no toast needed
    } catch (e: any) {
      if (e.name === "AbortError") return; // user cancelled
      // Fallback to clipboard on share failure
    }
  }

  // Desktop / fallback
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  } catch {
    toast.error("Could not copy link");
  }
}
