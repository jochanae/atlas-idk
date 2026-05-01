import { useCallback, useEffect, useRef, useState } from "react";

/**
 * LivePreview — renders generated React component code in a sandboxed iframe.
 * Supports bidirectional linking: click an element in preview → parent receives
 * the component name; parent can highlight elements by sending a message back.
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
  /** Called when user clicks an element in the preview — receives the nearest component/tag name */
  onElementSelect?: (selector: string) => void;
};

const PREVIEW_SHELL = (componentCode: string) => `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
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
      background: #050505;
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
    /* Bidirectional link highlight */
    [data-atlas-highlight="true"] {
      outline: 2px solid rgba(201,162,76,0.7) !important;
      outline-offset: 2px;
      border-radius: 4px;
      animation: atlas-link-pulse 1.5s ease-in-out 2;
    }
    @keyframes atlas-link-pulse {
      0%, 100% { outline-color: rgba(201,162,76,0.3); }
      50% { outline-color: rgba(201,162,76,0.9); }
    }
  <\/style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module" data-presets="typescript,react">
    try {
      ${componentCode}

      // Find the default export
      const Component = typeof exports !== 'undefined' && exports.default
        ? exports.default
        : typeof DefaultComponent !== 'undefined'
          ? DefaultComponent
          : null;

      if (Component) {
        // Provide demo props so components with required props still render
        var demoProps = {
          title: 'Pro Plan', name: 'Atlas', label: 'Featured',
          price: 49, description: 'Everything you need to build at scale.',
          features: ['Unlimited projects', 'Priority support', 'Custom domains', 'Advanced analytics'],
          items: ['Item 1', 'Item 2', 'Item 3'],
          children: 'Hello World',
          onClick: function(){}, onSelect: function(){}, onSubmit: function(){},
          buttonText: 'Get Started', popular: true, isPopular: true,
        };
        var container = document.getElementById('root');
        // React 18 UMD: try createRoot first, fall back to legacy render
        var appEl = React.createElement('div', {
          style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
        }, React.createElement(Component, demoProps));
        if (ReactDOM.createRoot) {
          ReactDOM.createRoot(container).render(appEl);
        } else {
          ReactDOM.render(appEl, container);
        }
      } else {
        document.getElementById('root').innerHTML =
          '<div class="preview-error">No default export found in component.</div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div class="preview-error">Render error:\\n' + err.message + '</div>';
    }
  <\/script>
  <script>
    // Bidirectional linking — click handler
    document.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var el = e.target;
      // Walk up to find meaningful element
      var tag = el.tagName.toLowerCase();
      var cls = el.className ? ('.' + String(el.className).split(' ').filter(Boolean).slice(0,2).join('.')) : '';
      var text = (el.textContent || '').trim().slice(0, 40);
      var selector = tag + cls;
      // Clear previous highlights
      document.querySelectorAll('[data-atlas-highlight]').forEach(function(h) {
        h.removeAttribute('data-atlas-highlight');
      });
      el.setAttribute('data-atlas-highlight', 'true');
      window.parent.postMessage({
        type: 'atlas-element-select',
        selector: selector,
        tag: tag,
        text: text
      }, '*');
    }, true);

    // Receive highlight commands from parent
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'atlas-highlight-element') {
        document.querySelectorAll('[data-atlas-highlight]').forEach(function(h) {
          h.removeAttribute('data-atlas-highlight');
        });
        try {
          var target = document.querySelector(e.data.selector);
          if (target) {
            target.setAttribute('data-atlas-highlight', 'true');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } catch(err) {}
      }
    });
  <\/script>
</body>
</html>`;

/**
 * Transform the AI-generated TSX so it works in the browser sandbox.
 */
function prepareForSandbox(code: string): string {
  let prepared = code
    // Strip all imports
    .replace(/^import\s+.*?(?:from\s+['"].*?['"]|['"].*?['"])\s*;?\s*$/gm, "")
    // Strip multi-line interfaces and types (including nested braces)
    .replace(/^(?:export\s+)?(?:interface|type)\s+\w+[^{]*\{[^}]*\}\s*;?\s*$/gm, "")
    // Rename default export function
    .replace(
      /export\s+default\s+function\s+(\w+)/g,
      "function DefaultComponent",
    )
    .replace(/export\s+default\s+/g, "var DefaultComponent = ")
    .replace(/export\s+(const|let|var|function|type|interface)\s/g, "$1 ")
    // Strip remaining type annotations that would fail at runtime
    .replace(/:\s*React\.FC(?:<[^>]*>)?/g, "")
    .replace(/:\s*JSX\.Element/g, "");

  // Provide React hooks as globals (imports get stripped)
  const runtimeStub = `
    var useState = React.useState, useEffect = React.useEffect,
        useCallback = React.useCallback, useMemo = React.useMemo,
        useRef = React.useRef, useContext = React.useContext,
        Fragment = React.Fragment, createElement = React.createElement;
    var _iconFallback = function(props) {
      return React.createElement('span', {style:{display:'inline-block',width:16,height:16}}, '●');
    };
    var Check = _iconFallback, X = _iconFallback, Star = _iconFallback,
        ChevronRight = _iconFallback, ArrowRight = _iconFallback, Heart = _iconFallback,
        Shield = _iconFallback, Zap = _iconFallback, Crown = _iconFallback,
        Sparkles = _iconFallback, BadgeCheck = _iconFallback, Circle = _iconFallback;
  `;

  return runtimeStub + "\n" + prepared;
}

export function LivePreview({ code, filename, loading, error, onElementSelect }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  // Listen for bidirectional link messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "atlas-element-select") {
        const label = e.data.text
          ? `<${e.data.tag}> "${e.data.text}"`
          : `<${e.data.tag}>${e.data.selector}`;
        setSelectedElement(label);
        onElementSelect?.(e.data.selector);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onElementSelect]);

  /** Send highlight command to iframe */
  const highlightInPreview = useCallback((selector: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "atlas-highlight-element", selector },
      "*",
    );
  }, []);

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
      background: "#050505",
      border: "1px solid rgba(201,162,76,0.4)",
      borderRadius: 8,
    }}
  >
      {/* Filename bar + bidirectional link indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "0.5px solid var(--glass-border)",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          flexShrink: 0,
        }}
      >
        {filename && (
          <>
            <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="var(--accent-gold)" strokeWidth={1.5}>
              <path d="M5 12l-3-4 3-4M11 4l3 4-3 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ color: "var(--accent-gold)", letterSpacing: "0.06em" }}>
              {filename}
            </span>
          </>
        )}
        {selectedElement && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              color: "var(--phosphor)",
              background: "color-mix(in oklab, var(--phosphor) 10%, transparent)",
              padding: "2px 8px",
              borderRadius: 6,
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ↗ {selectedElement}
          </span>
        )}
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc!}
        sandbox="allow-scripts"
        style={{
          flex: 1,
          border: "none",
          width: "100%",
          background: "#050505",
          borderRadius: "0 0 7px 7px",
        }}
        title="Component Preview"
      />
    </div>
  );
}
