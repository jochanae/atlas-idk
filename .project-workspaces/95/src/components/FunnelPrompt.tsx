import { useState, useRef } from 'react';
import { generateFunnel } from '../api/funnelGenerator';
import { useFunnelStore } from '../hooks/useFunnelStore';

export default function FunnelPrompt() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addFunnel } = useFunnelStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    try {
      const funnel = await generateFunnel(trimmed);
      addFunnel(funnel);
      setPrompt('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch {
      setError('Generation failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(245,158,11,0.15)' }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1L6.5 4H9.5L7 6L8 9L5 7.5L2 9L3 6L0.5 4H3.5L5 1Z" fill="#F59E0B" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/60 tracking-wide">Describe your offer or audience</span>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="e.g. Coaching program for busy moms who want to start freelancing…"
        rows={2}
        className="w-full bg-transparent text-sm text-white placeholder-white/25 resize-none outline-none leading-relaxed"
        style={{ minHeight: '48px', maxHeight: '120px' }}
        disabled={loading}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!prompt.trim() || loading}
        className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 flex items-center justify-center gap-2"
        style={{
          background: prompt.trim() && !loading
            ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
            : 'rgba(255,255,255,0.06)',
          color: prompt.trim() && !loading ? '#000' : 'rgba(255,255,255,0.25)',
        }}
      >
        {loading ? (
          <>
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
              <path d="M7 1a6 6 0 016 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Generating funnel…
          </>
        ) : (
          'Generate Funnel'
        )}
      </button>
    </div>
  );
}