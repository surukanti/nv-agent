import { renderMarkdown } from '../../services/markdown';
import { ICONS } from '../../utils/constants';
import { useClipboard } from '../../hooks/useClipboard';

interface MessageItemProps {
  message: {
    id: string;
    role: string;
    content: string;
    reasoning?: string;
    timestamp?: number;
  };
  onRegenerate: () => void;
}

function formatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageItem({ message, onRegenerate }: MessageItemProps) {
  const copy = useClipboard();
  const time = formatTime(message.timestamp);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-3 px-6 py-3 max-w-[var(--max-width-input)] mx-auto w-full" style={{ animation: 'welcome-in 200ms cubic-bezier(.16,1,.3,1) forwards' }}>
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className="flex items-center gap-2">
            {time && <span className="text-[11px] text-zinc-600">{time}</span>}
            <span className="text-[11px] font-medium text-zinc-500">You</span>
          </div>
          <div className="bg-[#1c3a18] px-4 py-2.5 rounded-[18px_18px_4px_18px] inline-block text-sm leading-relaxed">
            {message.content}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-brand-dim text-brand flex items-center justify-center flex-shrink-0 mt-5">
          {ICONS.userAvatar}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-6 py-3 max-w-[var(--max-width-input)] mx-auto w-full group" style={{ animation: 'welcome-in 200ms cubic-bezier(.16,1,.3,1) forwards' }}>
      <div className="w-8 h-8 rounded-full bg-[var(--color-elevated)] border border-[var(--color-border)] text-brand flex items-center justify-center flex-shrink-0 mt-5">
        {ICONS.botAvatar}
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-brand">NV-Agent</span>
          {time && <span className="text-[11px] text-zinc-600">{time}</span>}
        </div>
        {message.reasoning && (
          <details className="thinking-block border-l-2 border-brand rounded-r-lg bg-[rgba(118,185,0,.04)]">
            <summary className="thinking-summary px-3 py-2 text-xs text-zinc-400 font-medium cursor-pointer">Reasoning (click to expand)</summary>
            <div className="thinking-content px-3 pb-2.5 text-xs text-zinc-500 leading-relaxed max-h-[300px] overflow-y-auto border-t border-[var(--color-border)]">
              {message.reasoning}
            </div>
          </details>
        )}
        <div className="message-content bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        <div className="flex gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => copy(message.content)} className="flex items-center gap-1 text-xs text-zinc-500 px-2 py-1 rounded hover:text-zinc-200 hover:bg-[var(--color-elevated)] transition-colors" aria-label="Copy message">
            {ICONS.copy} Copy
          </button>
          <button onClick={onRegenerate} className="flex items-center gap-1 text-xs text-zinc-500 px-2 py-1 rounded hover:text-zinc-200 hover:bg-[var(--color-elevated)] transition-colors" aria-label="Regenerate response">
            {ICONS.regenerate} Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
