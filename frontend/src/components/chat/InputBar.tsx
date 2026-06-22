import { useState, useEffect } from 'react';
import { useAutoResize } from '../../hooks/useAutoResize';
import { ICONS } from '../../utils/constants';

interface InputBarProps {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  prefillValue: string | null;
  onPrefillConsumed: () => void;
}

export function InputBar({ disabled, streaming, onSend, onStop, prefillValue, onPrefillConsumed }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useAutoResize(120);

  // Handle prefill from suggestion cards
  useEffect(() => {
    if (prefillValue != null) {
      setValue(prefillValue);
      onPrefillConsumed();
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      });
    }
  }, [prefillValue, onPrefillConsumed]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-6 py-4 pt-4 border-t border-[var(--color-border)] bg-[var(--color-base)]">
      <div className="relative max-w-[var(--max-width-input)] mx-auto">
        <div className="flex items-end gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 focus-within:border-brand focus-within:shadow-[0_0_0_1px_var(--color-brand),0_0_20px_rgba(118,185,0,.15)] transition-all">
          {/* Clip icon — visual affordance for attachments */}
          <button
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0 mb-0.5"
            aria-label="Attach file"
            title="Drag & drop files or use KB Upload"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your knowledge base…"
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent border-none text-sm text-zinc-200 resize-none outline-none max-h-[120px] leading-relaxed py-1"
            aria-label="Message input"
          />
          {streaming ? (
            <button
              onClick={onStop}
              className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm hover:bg-red-600 active:scale-95 transition-all"
              aria-label="Stop generating"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="w-9 h-9 rounded-full bg-brand text-black flex items-center justify-center flex-shrink-0 shadow-sm hover:not-disabled:bg-brand-hover hover:not-disabled:scale-105 active:not-disabled:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {ICONS.send}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-600 mt-2">
          <div>
            <kbd className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-mono bg-[var(--color-elevated)] border border-[var(--color-border)] rounded text-zinc-500">Enter</kbd> to send · <kbd className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-mono bg-[var(--color-elevated)] border border-[var(--color-border)] rounded text-zinc-500">Shift+Enter</kbd> for new line
          </div>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            <span className="font-medium text-zinc-500">NIM</span>
          </span>
        </div>
      </div>
    </div>
  );
}
