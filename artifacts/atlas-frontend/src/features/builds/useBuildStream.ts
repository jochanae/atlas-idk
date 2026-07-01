import { useState, useRef, useCallback } from "react";
import type { BuildCommand, BuildLine, BuildResult, BuildStatus } from "./types";

interface UseBuildStreamReturn {
  status: BuildStatus;
  lines: BuildLine[];
  result: BuildResult | null;
  run: (command: BuildCommand, projectId?: number) => void;
  cancel: () => void;
  reset: () => void;
}

export function useBuildStream(): UseBuildStreamReturn {
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [lines, setLines] = useState<BuildLine[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setLines([]);
    setResult(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  const run = useCallback(async (command: BuildCommand, projectId?: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStatus("running");
    setLines([]);
    setResult(null);

    const linesAccum: BuildLine[] = [];

    try {
      const resp = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, projectId }),
        signal: ac.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(5).trim());

            if (event.type === "line") {
              const line: BuildLine = { kind: event.kind, text: event.text };
              linesAccum.push(line);
              setLines((prev) => [...prev, line]);
            }

            if (event.type === "done") {
              const res: BuildResult = {
                buildId: event.buildId,
                command: event.command as BuildCommand,
                status: event.status as BuildStatus,
                exitCode: event.exitCode,
                duration: event.duration,
                errorSummary: event.errorSummary,
                lines: linesAccum,
              };
              setResult(res);
              setStatus(event.status as BuildStatus);
              return;
            }

            if (event.type === "error") {
              setStatus("error");
              return;
            }
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setStatus("error");
      }
    }
  }, []);

  return { status, lines, result, run, cancel, reset };
}
