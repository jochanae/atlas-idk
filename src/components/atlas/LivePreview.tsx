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
  <script>
    // (3) Surface ANY uncaught error (including Babel parse failures) into the visible error pane.
    window.addEventListener('error', function(e) {
      var root = document.getElementById('root');
      if (root && !root.firstChild) {
        root.innerHTML = '<div class="preview-error">Preview error:\\n' +
          (e.message || 'Unknown error') +
          (e.filename ? '\\n  at line ' + e.lineno : '') +
          '</div>';
      }
    });
  <\/script>
  <script type="text/babel" data-type="module" data-presets="typescript,react">
    try {
      ${componentCode}

      // (2) Find the rendered component — handles ESM default-export rewrites,
      // CommonJS exports.default, and the legacy DefaultComponent var.
      var Component = (typeof DefaultComponent !== 'undefined' && DefaultComponent) ||
        (typeof exports !== 'undefined' && exports && exports.default) ||
        null;

      if (Component) {
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
          '<div class="preview-error">No default export found.\\nMake sure the file ends with: export default ComponentName</div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div class="preview-error">Render error:\\n' + (err && err.message ? err.message : String(err)) + '</div>';
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
 * (1) Strip imports — both single-line AND multi-line ({\n  Foo,\n  Bar\n} from "...").
 * (1) Strip multi-line interfaces / types using brace-depth counting.
 * (2) Rewrite ESM `export default` so the sandbox can find the component.
 */
function stripMultiLineBlocks(src: string, startKeywordRe: RegExp): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const remaining = src.slice(i);
    const m = remaining.match(startKeywordRe);
    if (!m || m.index === undefined) {
      out += remaining;
      break;
    }
    out += remaining.slice(0, m.index);
    let j = m.index + m[0].length;
    // Find first { then count braces to its match
    while (j < remaining.length && remaining[j] !== "{") j++;
    if (j >= remaining.length) { out += remaining.slice(m.index); break; }
    let depth = 0;
    for (; j < remaining.length; j++) {
      if (remaining[j] === "{") depth++;
      else if (remaining[j] === "}") { depth--; if (depth === 0) { j++; break; } }
    }
    // Skip optional trailing semicolon and newline
    if (remaining[j] === ";") j++;
    if (remaining[j] === "\n") j++;
    i += m.index + j - m.index;
  }
  return out;
}

function prepareForSandbox(code: string): string {
  let prepared = code
    // Strip single-line imports
    .replace(/^import\s+[^;{]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    // Strip side-effect imports: import "foo";
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    // Strip multi-line imports: import { A,\n B \n} from "..."
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, "")
    // Strip "import Foo, { Bar } from ..."
    .replace(/import\s+\w+\s*,\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, "");

  // Strip multi-line interfaces and types (brace-aware)
  prepared = stripMultiLineBlocks(prepared, /^(?:export\s+)?interface\s+\w+[^{]*/m);
  prepared = stripMultiLineBlocks(prepared, /^(?:export\s+)?type\s+\w+\s*=\s*\{/m);
  // Single-line type aliases: type Foo = string;
  prepared = prepared.replace(/^(?:export\s+)?type\s+\w+\s*=\s*[^;{]+;?\s*$/gm, "");

  // (2) Rewrite default export — handle function, arrow, and identifier forms.
  prepared = prepared
    .replace(/export\s+default\s+function\s+\w+/g, "function DefaultComponent")
    .replace(/export\s+default\s+function\s*\(/g, "function DefaultComponent(")
    .replace(/export\s+default\s+/g, "var DefaultComponent = ")
    // Drop named exports
    .replace(/export\s+(const|let|var|function|class)\s/g, "$1 ")
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "")
    // Strip remaining type annotations that would fail at runtime
    .replace(/:\s*React\.FC(?:<[^>]*>)?/g, "")
    .replace(/:\s*JSX\.Element/g, "")
    // Strip "as Foo" type assertions (simple cases)
    .replace(/\s+as\s+[A-Z]\w*(?:\[\])?/g, "");

  // Provide React hooks + a Proxy-based fallback for any lucide icon / UI component.
  // Any unresolved identifier referenced as <Icon/> or <Button/> falls through to a stub.
  const runtimeStub = `
    var useState = React.useState, useEffect = React.useEffect,
        useCallback = React.useCallback, useMemo = React.useMemo,
        useRef = React.useRef, useContext = React.useContext,
        useReducer = React.useReducer, useLayoutEffect = React.useLayoutEffect,
        Fragment = React.Fragment, createElement = React.createElement;

    // Universal icon stub — renders a small dot for any lucide-react icon.
    var _IconStub = function(props) {
      return React.createElement('span', {
        style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                 width: (props && props.size) || 16, height: (props && props.size) || 16,
                 color: 'currentColor' }
      }, '●');
    };

    // Universal shadcn UI stub — renders children inside a styled wrapper.
    var _UIStub = function(tag, baseStyle) {
      return function(props) {
        var p = props || {};
        return React.createElement(tag || 'div', {
          className: p.className,
          style: Object.assign({}, baseStyle || {}, p.style || {}),
          onClick: p.onClick,
        }, p.children);
      };
    };

    // Pre-declare the most common lucide names and shadcn primitives.
    // Anything not pre-declared stays undefined — wrap the eval in a Proxy
    // by attaching all identifiers to window via a getter trap.
    var Button = _UIStub('button', { padding: '8px 16px', borderRadius: 8,
      background: 'rgba(201,162,76,0.15)', color: '#c9a24c',
      border: '1px solid rgba(201,162,76,0.4)', cursor: 'pointer', fontSize: 14 });
    var Card = _UIStub('div', { padding: 24, borderRadius: 12,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' });
    var CardHeader = _UIStub('div', { marginBottom: 12 });
    var CardTitle = _UIStub('h3', { fontSize: 18, fontWeight: 600, color: '#e8e4dd' });
    var CardDescription = _UIStub('p', { fontSize: 14, color: 'rgba(232,228,221,0.65)' });
    var CardContent = _UIStub('div', {});
    var CardFooter = _UIStub('div', { marginTop: 16 });
    var Badge = _UIStub('span', { padding: '2px 8px', borderRadius: 999,
      background: 'rgba(201,162,76,0.15)', color: '#c9a24c', fontSize: 12 });
    var Input = _UIStub('input', { padding: 8, borderRadius: 6,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
      color: '#e8e4dd', width: '100%' });
    var Label = _UIStub('label', { fontSize: 13, color: 'rgba(232,228,221,0.8)' });
    var Separator = _UIStub('hr', { border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '12px 0' });
    var Avatar = _UIStub('div', { width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,162,76,0.2)' });
    var AvatarImage = _UIStub('img', { width: '100%', height: '100%', borderRadius: '50%' });
    var AvatarFallback = _UIStub('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' });
    var Tabs = _UIStub('div', {});
    var TabsList = _UIStub('div', { display: 'flex', gap: 4, marginBottom: 12 });
    var TabsTrigger = _UIStub('button', { padding: '6px 12px', background: 'transparent', color: '#e8e4dd', border: 'none', cursor: 'pointer' });
    var TabsContent = _UIStub('div', {});

    // Lucide icons — assign the stub to every common name.
    var Check = _IconStub, X = _IconStub, Star = _IconStub, ChevronRight = _IconStub,
        ChevronLeft = _IconStub, ChevronDown = _IconStub, ChevronUp = _IconStub,
        ArrowRight = _IconStub, ArrowLeft = _IconStub, ArrowUp = _IconStub, ArrowDown = _IconStub,
        Heart = _IconStub, Shield = _IconStub, Zap = _IconStub, Crown = _IconStub,
        Sparkles = _IconStub, BadgeCheck = _IconStub, Circle = _IconStub, Square = _IconStub,
        Plus = _IconStub, Minus = _IconStub, Trash = _IconStub, Edit = _IconStub, Edit2 = _IconStub, Edit3 = _IconStub,
        Settings = _IconStub, User = _IconStub, Users = _IconStub, Mail = _IconStub, Phone = _IconStub,
        Search = _IconStub, Filter = _IconStub, Menu = _IconStub, MoreHorizontal = _IconStub, MoreVertical = _IconStub,
        Home = _IconStub, Folder = _IconStub, File = _IconStub, FileText = _IconStub, Image = _IconStub,
        Bell = _IconStub, Bookmark = _IconStub, Calendar = _IconStub, Clock = _IconStub, Download = _IconStub, Upload = _IconStub,
        Eye = _IconStub, EyeOff = _IconStub, Lock = _IconStub, Unlock = _IconStub, Key = _IconStub,
        Globe = _IconStub, Wifi = _IconStub, Cloud = _IconStub, Database = _IconStub, Server = _IconStub,
        Code = _IconStub, Code2 = _IconStub, Terminal = _IconStub, Cpu = _IconStub, Box = _IconStub, Package = _IconStub,
        Rocket = _IconStub, Bot = _IconStub, Brain = _IconStub, MessageSquare = _IconStub, MessageCircle = _IconStub, Send = _IconStub,
        Play = _IconStub, Pause = _IconStub, Stop = _IconStub, SkipForward = _IconStub, SkipBack = _IconStub,
        Sun = _IconStub, Moon = _IconStub, Layers = _IconStub, Layout = _IconStub, LayoutGrid = _IconStub,
        Activity = _IconStub, TrendingUp = _IconStub, TrendingDown = _IconStub, BarChart = _IconStub, PieChart = _IconStub,
        AlertCircle = _IconStub, AlertTriangle = _IconStub, Info = _IconStub, HelpCircle = _IconStub, CheckCircle = _IconStub, XCircle = _IconStub,
        Github = _IconStub, Twitter = _IconStub, Linkedin = _IconStub, Facebook = _IconStub, Instagram = _IconStub,
        ExternalLink = _IconStub, Link = _IconStub, Link2 = _IconStub, Copy = _IconStub, Share = _IconStub, Share2 = _IconStub,
        Loader = _IconStub, Loader2 = _IconStub, RefreshCw = _IconStub, RotateCw = _IconStub,
        Flame = _IconStub, Lightbulb = _IconStub, Award = _IconStub, Trophy = _IconStub, Gift = _IconStub, Tag = _IconStub,
        Compass = _IconStub, Map = _IconStub, MapPin = _IconStub, Navigation = _IconStub,
        ShoppingCart = _IconStub, ShoppingBag = _IconStub, CreditCard = _IconStub, DollarSign = _IconStub,
        Camera = _IconStub, Video = _IconStub, Mic = _IconStub, MicOff = _IconStub, Volume = _IconStub, VolumeX = _IconStub,
        Smile = _IconStub, ThumbsUp = _IconStub, ThumbsDown = _IconStub;

    // Stub the cn() helper from shadcn — concatenates classnames.
    var cn = function() {
      return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
    };
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
      border: "1px solid rgba(201,162,76,0.6)",
      borderRadius: 8,
      transition: "box-shadow 200ms ease",
    }}
    onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 16px 2px rgba(201,162,76,0.25), 0 0 4px 1px rgba(201,162,76,0.15)"; e.currentTarget.style.outline = "2px solid rgba(201,162,76,0.7)"; e.currentTarget.style.outlineOffset = "2px"; }}
    onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.outline = "none"; }}
    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 16px 2px rgba(201,162,76,0.25), 0 0 4px 1px rgba(201,162,76,0.15)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    tabIndex={0}
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
