import { useState } from 'react';
import { useLinkStore } from '../hooks/useLinkStore';

const PLATFORM_ICONS: Record<string, string> = {
  ig: '📷',
  tt: '🎵',
  li: '💼',
  tw: '🐦',
  yt: '▶️',
};

export default function LinkManager() {
  const { links, toggleLink, updateLink, addLink } = useLinkStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newPlatform, setNewPlatform] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const startEdit = (id: string, url: string) => {
    setEditingId(id);
    setEditValue(url);
  };

  const saveEdit = (id: string) => {
    updateLink(id, editValue);
    setEditingId(null);
    setEditValue('');
  };

  const submitNew = () => {
    if (newPlatform.trim() && newUrl.trim()) {
      addLink(newPlatform.trim(), newUrl.trim());
      setNewPlatform('');
      setNewUrl('');
      setAddingNew(false);
    }
  };

  return (
    <div className="space-y-3">
      {links.map((link) => (
        <div
          key={link.id}
          className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${link.active ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.07)'}`,
            transition: 'border-color 0.15s ease',
          }}
        >
          {/* Platform icon */}
          <span className="text-lg flex-shrink-0 w-7 text-center">
            {PLATFORM_ICONS[link.icon ?? ''] ?? '🔗'}
          </span>

          {/* Platform name + URL */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/70">{link.platform}</p>
            {editingId === link.id ? (
              <input
                autoFocus
                className="mt-0.5 w-full bg-transparent text-xs text-white outline-none border-b border-amber-400/50"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit(link.id)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(link.id)}
                placeholder="https://..."
              />
            ) : (
              <button
                className="mt-0.5 text-xs text-white/35 truncate max-w-full text-left hover:text-white/60 transition-colors"
                onClick={() => startEdit(link.id, link.url)}
              >
                {link.url || 'Tap to add URL'}
              </button>
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={() => toggleLink(link.id)}
            className="flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 relative"
            style={{
              background: link.active ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.1)',
            }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200"
              style={{
                left: link.active ? 'calc(100% - 22px)' : '2px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            />
          </button>
        </div>
      ))}

      {/* Add new link */}
      {addingNew ? (
        <div
          className="rounded-2xl px-4 py-4 space-y-3"
          style={{
            background: 'rgba(245,158,11,0.05)',
            border: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <input
            autoFocus
            className="w-full bg-transparent text-sm text-white outline-none placeholder-white/25 border-b border-white/10 pb-1"
            placeholder="Platform name (e.g. Pinterest)"
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
          />
          <input
            className="w-full bg-transparent text-sm text-white outline-none placeholder-white/25 border-b border-white/10 pb-1"
            placeholder="https://..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={submitNew}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgba(245,158,11,0.8)', color: '#000' }}
            >
              Add Link
            </button>
            <button
              onClick={() => setAddingNew(false)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="w-full py-3 rounded-2xl text-xs font-medium text-white/40 transition-all duration-150 flex items-center justify-center gap-2"
          style={{ border: '1px dashed rgba(255,255,255,0.12)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add channel
        </button>
      )}
    </div>
  );
}