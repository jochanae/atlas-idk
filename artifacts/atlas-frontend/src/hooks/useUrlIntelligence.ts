/**
 * useUrlIntelligence — detects the first URL in the chat input and fetches
 * a combined screenshot + scrape payload from /api/url-intelligence.
 *
 * Returns null when:
 *  - no URL is in the input
 *  - the preview has been dismissed by the user
 *  - the URL is a bare image file
 */

import { useState, useEffect, useRef } from "react";

export interface UrlIntelligenceData {
  url: string;
  host: string;
  detectedService: string | null;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  headings: string[];
  text: string | null;
  screenshotBase64: string | null;
  screenshotRaw: { base64: string; mediaType: string } | null;
}

export interface UseUrlIntelligenceResult {
  detectedUrl: string | null;
  data: UrlIntelligenceData | null;
  loading: boolean;
  error: boolean;
  dismiss: () => void;
}

const URL_RE = /https?:\/\/[^\s<>"'()[\]{}\\]+/g;
const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)(\?.*)?$/i;
const DEBOUNCE_MS = 700;

function extractFirstUrl(text: string): string | null {
  const matches = text.match(URL_RE) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    if (IMAGE_EXT.test(url)) continue;
    try { new URL(url); } catch { continue; }
    return url;
  }
  return null;
}

export function useUrlIntelligence(input: string): UseUrlIntelligenceResult {
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [data, setData] = useState<UrlIntelligenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    const found = extractFirstUrl(input);

    // If input cleared, reset everything
    if (!found) {
      setDetectedUrl(null);
      setData(null);
      setLoading(false);
      setError(false);
      fetchedForRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
      return;
    }

    setDetectedUrl(found);

    // Already dismissed this URL — don't re-fetch
    if (found === dismissedUrl) return;

    // Already fetched for this URL — don't re-fetch
    if (found === fetchedForRef.current) return;

    // Debounce the network call
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(false);
      setData(null);
      fetchedForRef.current = found;

      try {
        const res = await fetch("/api/url-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: found }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const payload = await res.json() as UrlIntelligenceData;
        setData(payload);
        setLoading(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(true);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, dismissedUrl]);

  const dismiss = () => {
    setDismissedUrl(detectedUrl);
    setData(null);
    setLoading(false);
    setError(false);
  };

  return { detectedUrl, data, loading, error, dismiss };
}
