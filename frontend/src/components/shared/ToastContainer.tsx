import type { ToastItem } from '../../types/chat';
import { cn } from '../../utils/cn';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'px-4 py-3 rounded-lg text-sm max-w-[360px] shadow-md overflow-hidden relative',
          t.type === 'success' && 'bg-green-600 text-white',
          t.type === 'error' && 'bg-red-500 text-white',
          t.type === 'info' && 'bg-[var(--color-elevated)] border border-[var(--color-border)] text-zinc-200',
          t.exiting ? 'animate-toast-out' : 'animate-toast-in',
        )} role="alert">
          <span>{t.message}</span>
          <div className="absolute bottom-0 left-0 h-0.5 bg-white/40 rounded-b-lg" style={{ animation: `toast-countdown ${t.duration}ms linear forwards` }} />
        </div>
      ))}
    </div>
  );
}
