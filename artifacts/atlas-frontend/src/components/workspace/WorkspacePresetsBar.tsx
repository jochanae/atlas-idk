import { useState, useRef } from "react";
import { useWorkspacePresets, type WorkspaceLens } from "@/hooks/useWorkspacePresets";

const LENS_LABEL: Record<WorkspaceLens, string> = {
  designer: "Designer",
  builder: "Builder",
  storyteller: "Storyteller",
};

const MODEL_LABEL: Record<string, string> = {
  multi: "Multi",
  claude: "Claude",
  gemini: "Gemini",
  gpt4o: "GPT-4o",
};

const LENS_COLOR: Record<WorkspaceLens, string> = {
  designer: "rgba(139,92,246,0.75)",
  builder: "rgba(196,82,26,0.75)",
  storyteller: "rgba(201,162,76,0.75)",
};

function PresetChip({
  name, model, lens, onApply, onRemove,
}: {
  name: string;
  model: string;
  lens: WorkspaceLens;
  onApply: () => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);
  const accent = LENS_COLOR[lens] ?? "rgba(201,162,76,0.75)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        borderRadius: 7,
        border: `1px solid ${hover ? accent : "rgba(201,162,76,0.22)"}`,
        background: hover ? "rgba(201,162,76,0.05)" : "transparent",
        overflow: "hidden",
        transition: "border-color 120ms ease, background 120ms ease",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onApply}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={`Apply: ${name} · ${MODEL_LABEL[model] ?? model} · ${LENS_LABEL[lens]}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 8px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--atlas-fg)",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: accent, flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "var(--app-font-mono, monospace)",
          fontSize: 11,
          letterSpacing: "0.04em",
          color: "var(--atlas-fg)",
          maxWidth: 110,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {name}
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono, monospace)",
          fontSize: 10,
          color: "var(--atlas-muted)",
          opacity: 0.6,
          whiteSpace: "nowrap",
        }}>
          {MODEL_LABEL[model] ?? model} · {LENS_LABEL[lens]}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onMouseEnter={() => setRemoveHover(true)}
        onMouseLeave={() => setRemoveHover(false)}
        title="Remove preset"
        aria-label="Remove preset"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5px 7px",
          background: removeHover ? "rgba(255,80,60,0.12)" : "transparent",
          border: "none",
          borderLeft: "1px solid rgba(201,162,76,0.13)",
          cursor: "pointer",
          color: removeHover ? "rgba(255,100,80,0.85)" : "rgba(var(--atlas-muted-rgb),0.45)",
          fontSize: 13,
          lineHeight: 1,
          transition: "background 100ms ease, color 100ms ease",
        }}
      >
        ×
      </button>
    </span>
  );
}

export function WorkspacePresetsBar({
  currentModel,
  currentLens,
  onClose,
}: {
  currentModel: string;
  currentLens: WorkspaceLens;
  onClose?: () => void;
}) {
  const { presets, addPreset, removePreset, applyPreset } = useWorkspacePresets();
  const [saving, setSaving] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startSave = () => {
    const suggested = `${MODEL_LABEL[currentModel] ?? currentModel} · ${LENS_LABEL[currentLens]}`;
    setNameInput(suggested);
    setSaving(true);
    setTimeout(() => inputRef.current?.select(), 40);
  };

  const confirmSave = () => {
    if (!nameInput.trim()) return;
    addPreset(nameInput.trim(), currentModel, currentLens);
    setSaving(false);
    setNameInput("");
  };

  const cancelSave = () => {
    setSaving(false);
    setNameInput("");
  };

  return (
    <div style={{ padding: "0 14px 12px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span style={{
          fontFamily: "var(--app-font-mono, monospace)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--atlas-muted)",
          opacity: 0.75,
        }}>
          Presets {presets.length > 0 ? `· ${presets.length}` : ""}
        </span>
        {!saving && (
          <button
            type="button"
            onClick={startSave}
            title="Save current model + lens as a preset"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 5,
              background: "transparent",
              border: "1px solid rgba(201,162,76,0.28)",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 10,
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            Save current
          </button>
        )}
      </div>

      {saving && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave();
              if (e.key === "Escape") cancelSave();
            }}
            placeholder="Preset name…"
            autoFocus
            style={{
              flex: 1,
              minWidth: 0,
              background: "rgba(201,162,76,0.04)",
              border: "1px solid rgba(201,162,76,0.28)",
              borderRadius: 6,
              padding: "5px 9px",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={confirmSave}
            disabled={!nameInput.trim()}
            style={{
              padding: "5px 11px",
              borderRadius: 6,
              background: nameInput.trim() ? "rgba(201,162,76,0.16)" : "rgba(201,162,76,0.04)",
              border: "1px solid rgba(201,162,76,0.28)",
              color: "var(--atlas-gold)",
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 11,
              cursor: nameInput.trim() ? "pointer" : "default",
              opacity: nameInput.trim() ? 1 : 0.45,
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={cancelSave}
            style={{
              padding: "5px 9px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid rgba(var(--atlas-muted-rgb),0.2)",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono, monospace)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {presets.length === 0 && !saving ? (
        <div style={{
          fontFamily: "var(--app-font-mono, monospace)",
          fontSize: 11,
          color: "var(--atlas-muted)",
          opacity: 0.45,
          padding: "4px 0 2px",
          letterSpacing: "0.03em",
        }}>
          No presets yet — save your current model + lens combination.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {presets.map((p) => (
            <PresetChip
              key={p.id}
              name={p.name}
              model={p.model}
              lens={p.lens}
              onApply={() => { applyPreset(p); onClose?.(); }}
              onRemove={() => removePreset(p.id)}
            />
          ))}
        </div>
      )}

      <div style={{
        margin: "10px -14px 0",
        borderTop: "1px solid rgba(201,162,76,0.1)",
      }} />
    </div>
  );
}
