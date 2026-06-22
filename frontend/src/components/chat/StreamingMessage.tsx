import { renderMarkdown } from '../../services/markdown';
import { ICONS } from '../../utils/constants';
import type { AgentStep } from '../../types/chat';
import { cn } from '../../utils/cn';

interface StreamingMessageProps {
  content: string;
  reasoning: string;
  agentStep: AgentStep;
}

const STEP_BADGES: Record<Exclude<AgentStep, 'idle'>, { icon: string; label: string }> = {
  searching: { icon: '🔍', label: 'Searching KB' },
  thinking: { icon: '💭', label: 'Thinking' },
  writing: { icon: '✍️', label: 'Writing' },
};

export function StreamingMessage({ content, reasoning, agentStep }: StreamingMessageProps) {
  const badge = agentStep !== 'idle' ? STEP_BADGES[agentStep] : null;

  return (
    <div className="flex gap-3 px-6 py-3 max-w-[var(--max-width-input)] mx-auto w-full">
      <div className="w-8 h-8 rounded-full bg-[var(--color-elevated)] border border-[var(--color-border)] text-brand flex items-center justify-center flex-shrink-0 mt-5">
        {ICONS.botAvatar}
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-brand">NV-Agent</span>
          {badge && (
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-300',
              agentStep === 'searching' && 'bg-blue-500/10 text-blue-400',
              agentStep === 'thinking' && 'bg-amber-500/10 text-amber-400',
              agentStep === 'writing' && 'bg-brand-dim text-brand',
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                agentStep === 'searching' && 'bg-blue-400 animate-step-pulse',
                agentStep === 'thinking' && 'bg-amber-400 animate-step-pulse',
                agentStep === 'writing' && 'bg-brand animate-step-pulse',
              )} />
              {badge.label}…
            </span>
          )}
        </div>
        {reasoning && (
          <details open className="thinking-block border-l-2 border-brand rounded-r-lg bg-[rgba(118,185,0,.04)]">
            <summary className="thinking-summary px-3 py-2 text-xs text-zinc-400 font-medium cursor-pointer flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-thinking-pulse" />
              Thinking…
            </summary>
            <div className="thinking-content px-3 pb-2.5 text-xs text-zinc-500 leading-relaxed max-h-[300px] overflow-y-auto border-t border-[var(--color-border)]">
              {reasoning}
            </div>
          </details>
        )}
        <div className="message-content bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm leading-relaxed">
          {content && <span dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />}
          <span className="inline-block w-0.5 h-[1em] bg-brand ml-0.5 align-text-bottom rounded-sm animate-cursor-pulse" />
        </div>
      </div>
    </div>
  );
}
