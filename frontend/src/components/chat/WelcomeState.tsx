import { ICONS } from '../../utils/constants';
import { cn } from '../../utils/cn';
import type { KBStatus } from '../../types/api';

interface WelcomeStateProps {
  onSuggestionClick: (text: string) => void;
  kbStatus: KBStatus | null;
}

const SUGGESTIONS = [
  { icon: ICONS.document, text: 'What documents are in the knowledge base?', desc: 'Browse indexed documents' },
  { icon: ICONS.list, text: 'Summarize the key topics covered', desc: 'Get an overview of content' },
  { icon: ICONS.search, text: 'What are the main findings?', desc: 'Discover key insights' },
  { icon: ICONS.chart, text: 'Compare the different approaches mentioned', desc: 'Analyze differences' },
];

const PILLS = ['RAG-Powered Agent', 'Real-time Streaming', 'Cited Answers', 'Multi-format KB'];

export function WelcomeState({ onSuggestionClick, kbStatus }: WelcomeStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-10 gap-6 opacity-0 -translate-y-2 animate-welcome-in">
      {/* Logo with glow rings */}
      <div className="relative w-[88px] h-[88px] flex items-center justify-center">
        <span className="text-brand relative z-[1]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/></svg>
        </span>
        <div className="absolute -inset-2 rounded-full border-2 border-brand opacity-[.15] animate-glow-pulse" />
        <div className="absolute -inset-5 rounded-full border border-brand opacity-[.07] animate-glow-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute -inset-8 rounded-full border border-brand opacity-[.03] animate-glow-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-[32px] font-bold tracking-tight bg-gradient-to-br from-brand to-brand-hover bg-clip-text text-transparent">NV-Agent</h2>
        <p className="text-zinc-400 text-[15px] max-w-[480px]">Your AI agent with knowledge base access</p>
      </div>

      {/* KB Stats */}
      {kbStatus && (
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
            <span className={cn('w-2 h-2 rounded-full', kbStatus.index_ready ? 'bg-brand animate-pulse' : 'bg-red-500')} />
            <span className="text-zinc-400">{kbStatus.index_ready ? 'KB Ready' : 'KB Not Ready'}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-zinc-400">
            {ICONS.fileText}
            <span className="font-semibold text-zinc-200">{kbStatus.total_chunks}</span> chunks
          </div>
          <div className="px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-zinc-400">
            Powered by <span className="font-semibold text-brand">NVIDIA NIM</span>
          </div>
        </div>
      )}

      {!kbStatus && (
        <div className="px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-zinc-400 text-sm">
          Powered by <span className="font-semibold text-brand">NVIDIA NIM</span>
        </div>
      )}

      {/* Suggestion Cards */}
      <div className="grid grid-cols-2 gap-3 max-w-[560px] w-full mt-2 max-[480px]:grid-cols-1">
        {SUGGESTIONS.map(s => (
          <button
            key={s.text}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-left cursor-pointer flex items-start gap-3 hover:border-brand hover:shadow-[0_0_24px_rgba(118,185,0,.12)] hover:-translate-y-0.5 hover:bg-[var(--color-elevated)] transition-all group/card"
            onClick={() => onSuggestionClick(s.text)}
          >
            <span className="text-brand flex-shrink-0 mt-0.5 group-hover/card:scale-110 transition-transform">{s.icon}</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-zinc-200 leading-snug">{s.text}</span>
              <span className="text-[11px] text-zinc-600">{s.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Feature Pills */}
      <div className="flex gap-2 flex-wrap justify-center mt-1 max-[480px]:hidden">
        {PILLS.map(pill => (
          <span key={pill} className="text-[11px] text-zinc-500 bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-full hover:border-brand/30 transition-colors cursor-default">{pill}</span>
        ))}
      </div>
    </div>
  );
}
