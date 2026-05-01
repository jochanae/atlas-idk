import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { Search } from "lucide-react";

// Dark theme matching Atlas obsidian palette
const atlasDarkTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "12px",
    fontFamily: "'Geist Mono', monospace",
  },
  ".cm-content": {
    caretColor: "var(--accent-gold, #c9a84c)",
    padding: "8px 0",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent-gold, #c9a84c)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(201, 168, 76, 0.15) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.2)",
    minWidth: "36px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 6px 0 8px",
    fontSize: "10px",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 4px",
    cursor: "pointer",
  },
  ".cm-panels": {
    backgroundColor: "var(--card, #1a1a2e)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(201, 168, 76, 0.25)",
    outline: "1px solid rgba(201, 168, 76, 0.4)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(201, 168, 76, 0.4)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--card, #1a1a2e)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "rgba(201, 168, 76, 0.15)",
    },
  },
}, { dark: true });

const atlasHighlightStyle = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

function getLang(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["tsx", "ts", "jsx", "js", "mjs"].includes(ext)) return javascript({ jsx: true, typescript: ext.includes("ts") });
  if (["html", "htm", "svg"].includes(ext)) return html();
  if (["css", "scss"].includes(ext)) return css();
  if (["json", "jsonc"].includes(ext)) return json();
  return javascript({ jsx: true, typescript: true }); // fallback
}

interface CodeEditorProps {
  code: string;
  filename: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ code, filename, onChange, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const [showSearch, setShowSearch] = useState(false);

  const handleOpenSearch = useCallback(() => {
    if (viewRef.current) {
      openSearchPanel(viewRef.current);
      setShowSearch(true);
    }
  }, []);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        bracketMatching(),
        foldGutter(),
        indentOnInput(),
        closeBrackets(),
        autocompletion(),
        atlasDarkTheme,
        atlasHighlightStyle,
        langCompartment.current.of(getLang(filename)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        keymap.of([...defaultKeymap, ...searchKeymap, indentWithTab]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update code when prop changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== code) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      });
    }
  }, [code]);

  // Update language when filename changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(getLang(filename)),
    });
  }, [filename]);

  // Update readOnly
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider truncate">
          {filename}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenSearch}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Search (Ctrl+F)"
            aria-label="Search in file"
          >
            <Search size={12} />
          </button>
          {readOnly && (
            <span className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/20">
              Read-only
            </span>
          )}
        </div>
      </div>
      {/* Editor */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto" />
    </div>
  );
}
