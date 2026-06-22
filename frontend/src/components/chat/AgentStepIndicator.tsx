import type { AgentStep } from '../../types/chat';
import { cn } from '../../utils/cn';

interface AgentStepIndicatorProps {
  step: AgentStep;
}

const STEPS: { key: AgentStep; icon: string; label: string }[] = [
  { key: 'searching', icon: '🔍', label: 'Searching knowledge base' },
  { key: 'thinking', icon: '💭', label: 'Thinking' },
  { key: 'writing', icon: '✍️', label: 'Writing response' },
];

export function AgentStepIndicator({ step }: AgentStepIndicatorProps) {
  if (step === 'idle') return null;

  const currentIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="flex items-center gap-3 px-6 pt-3 max-w-[var(--max-width-input)] mx-auto">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === step;
          const isPast = i < currentIdx;
          return (
            <div
              key={s.key}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300',
                isCurrent && 'bg-brand-dim text-brand scale-105',
                isPast && 'bg-[var(--color-elevated)] text-brand/60',
                !isCurrent && !isPast && 'text-zinc-600',
              )}
            >
              <span className={cn(
                'text-[13px]',
                isCurrent && 'animate-step-pulse',
              )}>{s.icon}</span>
              <span className={cn(
                'transition-all duration-300 overflow-hidden whitespace-nowrap',
                isCurrent ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0',
              )}>
                {s.label}…
              </span>
            </div>
          );
        })}
      </div>

      {/* Step progress dots */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              i < currentIdx && 'bg-brand',
              i === currentIdx && 'bg-brand animate-step-pulse',
              i > currentIdx && 'bg-zinc-700',
            )}
          />
        ))}
      </div>
    </div>
  );
}
