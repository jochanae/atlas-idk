import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Key, Shield, AlertTriangle } from "lucide-react";

interface SecretEntry {
  name: string;
  isSet: boolean;
  managed?: boolean;
}

interface SecretsManagerPanelProps {
  secrets: SecretEntry[];
  onAddSecret?: (name: string) => void;
  onDeleteSecret?: (name: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const MANAGED_PREFIXES = ["SUPABASE_", "LOVABLE_"];

export function SecretsManagerPanel({
  secrets,
  onAddSecret,
  onDeleteSecret,
  onRefresh,
  loading = false,
}: SecretsManagerPanelProps) {
  const [newSecretName, setNewSecretName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isManaged = (name: string) => MANAGED_PREFIXES.some((p) => name.startsWith(p));

  const handleAdd = () => {
    const name = newSecretName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!name) return;
    onAddSecret?.(name);
    setNewSecretName("");
    setShowAdd(false);
  };

  const handleDelete = (name: string) => {
    if (confirmDelete === name) {
      onDeleteSecret?.(name);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(name);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const userSecrets = secrets.filter((s) => !isManaged(s.name));
  const managedSecrets = secrets.filter((s) => isManaged(s.name));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <Shield size={12} className="text-accent-foreground/60" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Secrets
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/40">
            ({secrets.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="text-[9px] font-mono text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/30 transition-colors disabled:opacity-30"
            >
              {loading ? "…" : "Refresh"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Add secret"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/30 bg-card/30">
          <p className="text-[9px] font-mono text-muted-foreground mb-1.5">
            Enter the secret name (e.g. STRIPE_API_KEY). You'll be prompted to enter the value securely.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newSecretName}
              onChange={(e) => setNewSecretName(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="SECRET_NAME"
              className="flex-1 px-2 py-1 rounded bg-background/50 border border-border/40 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newSecretName.trim()}
              className="px-2 py-1 rounded text-[9px] font-mono bg-accent/10 text-accent-foreground hover:bg-accent/20 disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Secret list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* User secrets */}
        {userSecrets.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1.5">
              Your secrets
            </p>
            <div className="space-y-1">
              {userSecrets.map((s) => (
                <SecretRow
                  key={s.name}
                  secret={s}
                  managed={false}
                  onDelete={() => handleDelete(s.name)}
                  confirmDelete={confirmDelete === s.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Managed secrets */}
        {managedSecrets.length > 0 && (
          <div className="px-3 py-2 border-t border-border/20">
            <p className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1.5">
              System (managed)
            </p>
            <div className="space-y-1">
              {managedSecrets.map((s) => (
                <SecretRow key={s.name} secret={s} managed />
              ))}
            </div>
          </div>
        )}

        {secrets.length === 0 && !loading && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <Key size={20} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-[10px] font-mono text-muted-foreground/50">
                No secrets configured yet
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SecretRow({
  secret,
  managed,
  onDelete,
  confirmDelete,
}: {
  secret: SecretEntry;
  managed: boolean;
  onDelete?: () => void;
  confirmDelete?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/20 transition-colors group">
      <Key size={10} className={`flex-shrink-0 ${managed ? "text-muted-foreground/30" : "text-accent-foreground/50"}`} />
      <span className={`flex-1 text-[10px] font-mono truncate ${managed ? "text-muted-foreground/50" : "text-foreground/80"}`}>
        {secret.name}
      </span>
      <span className="text-[8px] font-mono text-emerald-400/60 flex-shrink-0">
        {secret.isSet ? "SET" : "—"}
      </span>
      {!managed && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${
            confirmDelete
              ? "text-destructive bg-destructive/10"
              : "text-transparent group-hover:text-muted-foreground hover:text-destructive"
          }`}
          title={confirmDelete ? "Click again to confirm" : "Delete secret"}
        >
          {confirmDelete ? <AlertTriangle size={10} /> : <Trash2 size={10} />}
        </button>
      )}
    </div>
  );
}
