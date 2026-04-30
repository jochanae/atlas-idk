import { useCallback, useEffect, useRef, useState } from "react";

/**
 * LivePreview — renders generated React component code in a sandboxed iframe.
 * Uses srcdoc to create an isolated environment with Tailwind loaded via CDN.
 */

type Props = {
  /** The raw TSX/JSX code to render */
  code: string | null;
  /** File metadata */
  filename?: string;
  /** Whether to show a loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
};

const PREVIEW_SHELL = (componentCode: string) => `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@19/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            obsidian: { bg: '#1a1814', surface: '#23201b', border: '#2e2a24' },
            gold: { DEFAULT: '#c9a24c', dim: 'rgba(201,162,76,0.3)', glow: 'rgba(201,162,76,0.15)' },
          }
        }
      }
    }
  <\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1a1814;
      color: #e8e4dd;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
    }
    #root { min-height: 100vh; }
    .preview-error {
      padding: 24px;
      color: #ef4444;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 8px;
      margin: 16px;
    }
  <\/style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    try {
      ${componentCode}

      // Find the default export
      const Component = typeof exports !== 'undefined' && exports.default
        ? exports.default
        : typeof DefaultComponent !== 'undefined'
          ? DefaultComponent
          : null;

      if (Component) {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(Component));
      } else {
        document.getElementById('root').innerHTML =
          '<div class="preview-error">No default export found in component.</div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div class="preview-error">Render error:\\n' + err.message + '</div>';
    }
  <\/script>
</body>
</html>`;

/**
 * Transform the AI-generated TSX so it works in the browser sandbox:
 * - Strip TypeScript types (simplified)
 * - Convert export default to a global variable
 * - Strip import statements (React is global in the sandbox)
 */
function prepareForSandbox(code: string): string {
  let prepared = code
    // Remove import statements
    .replace(/^import\s+.*?(?:from\s+['"].*?['"]|['"].*?['"])\s*;?\s*$/gm, "")
    // Convert "export default function X" to "function DefaultComponent"
    .replace(
      /export\s+default\s+function\s+(\w+)/g,
      "function DefaultComponent",
    )
    // Convert "export default" to "var DefaultComponent ="
    .replace(/export\s+default\s+/g, "var DefaultComponent = ")
    // Remove named exports
    .replace(/export\s+(const|let|var|function|type|interface)\s/g, "$1 ")
    // Remove TypeScript type annotations (simplified)
    .replace(/:\s*React\.FC(?:<[^>]*>)?/g, "")
    .replace(/:\s*JSX\.Element/g, "")
    // Remove interface/type declarations
    .replace(/^(interface|type)\s+\w+[^{]*\{[^}]*\}\s*$/gm, "");

  return prepared;
}

export function LivePreview({ code, filename, loading, error }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);

  const srcdoc = code
    ? PREVIEW_SHELL(prepareForSandbox(code))
    : null;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 16,
          color: "var(--muted-text)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "2px solid var(--accent-gold)",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 800ms linear infinite",
          }}
        />
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Generating component…
        </span>
      </div>
    );
  }

  if (error || iframeError) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--ember, #ef4444)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {error || iframeError}
      </div>
    );
  }

  if (!code) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
            border: "0.5px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-gold)",
          }}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted-text)",
          }}
        >
          Live Preview
        </span>
        <span
          style={{
            fontSize: 12,
            color: "color-mix(in oklab, var(--muted-text) 70%, transparent)",
            maxWidth: 260,
            lineHeight: 1.5,
          }}
        >
          Ask Atlas to build something and the preview will appear here.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--background)",
      }}
    >
      {/* Filename bar */}
      {filename && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderBottom: "0.5px solid var(--glass-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--accent-gold)",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M5 12l-3-4 3-4M11 4l3 4-3 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {filename}
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc!}
        sandbox="allow-scripts"
        style={{
          flex: 1,
          border: "none",
          width: "100%",
          background: "#1a1814",
          borderRadius: "0 0 8px 8px",
        }}
        title="Component Preview"
      />
    </div>
  );
}
