import type { ReactNode } from 'react';
import { ICONS } from '../../utils/constants';
import { cn } from '../../utils/cn';
import type { KBStatus } from '../../types/api';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  kbStatus: KBStatus | null;
  children?: ReactNode;
}

export function Sidebar({ open, onClose, kbStatus, children }: SidebarProps) {
  return (
    <>
      <aside className={cn(
        'flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] overflow-hidden transition-[margin-left] duration-300',
        'w-[var(--width-sidebar)] min-w-[var(--width-sidebar)]',
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[100] max-md:shadow-[4px_0_24px_rgba(0,0,0,.5)]',
        !open && '-ml-[var(--width-sidebar)] max-md:shadow-none',
      )}>
        {/* Header — branded gradient */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
              {ICONS.logo}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight leading-tight">NV-Agent</span>
              <span className="text-[10px] text-zinc-600 leading-tight">AI Agent</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-[var(--color-elevated)] transition-colors"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer — KB status badge */}
        <div className="px-4 py-3 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-600">
              <span className={cn(
                'w-2 h-2 rounded-full',
                kbStatus?.index_ready ? 'bg-brand' : 'bg-zinc-700',
              )} />
              <span>{kbStatus?.index_ready ? 'KB Online' : 'KB Offline'}</span>
            </div>
            <span className="text-zinc-700">NVIDIA NIM</span>
          </div>
        </div>
      </aside>

      {/* Sidebar backdrop (mobile) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[99]"
          onClick={onClose}
        />
      )}
    </>
  );
}
