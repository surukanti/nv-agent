import { useState } from 'react';
import type { Session } from '../../types/api';
import { ICONS } from '../../utils/constants';
import { cn } from '../../utils/cn';

interface SessionsSectionProps {
  sessions: Session[];
  currentSessionId: string | null;
  streaming: boolean;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, label: string) => void;
  onNewSession: () => void;
  searchRef: React.Ref<HTMLInputElement>;
}

export function SessionsSection({
  sessions,
  currentSessionId,
  streaming,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  onNewSession,
  searchRef,
}: SessionsSectionProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const filteredSessions = sessions.filter(s =>
    !search || s.label.toLowerCase().includes(search.toLowerCase())
  );

  // All sessions are listed flat — the backend doesn't expose creation timestamps
  // so we can't group by date. We show them in reverse order (newest first).
  const sortedSessions = [...filteredSessions].reverse();

  return (
    <div className="border-b border-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recent Chats</span>
        <button
          onClick={onNewSession}
          disabled={streaming}
          className="flex items-center gap-1 bg-brand text-black font-medium rounded-lg py-1.5 px-2.5 text-xs hover:bg-brand-hover hover:-translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Start new chat"
        >
          {ICONS.plus} New
        </button>
      </div>

      <div className="px-3 pb-3">
        {/* Search */}
        <div className="relative mb-2">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600">{ICONS.search}</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--color-base)] border border-[var(--color-border)] rounded-lg text-sm pl-8 pr-3 py-1.5 focus:border-brand focus:outline-none placeholder:text-zinc-600"
            aria-label="Search sessions"
          />
        </div>

        {/* Session list */}
        <div className="max-h-[320px] overflow-y-auto space-y-0.5">
          {sortedSessions.length === 0 && (
            <div className="text-xs text-zinc-600 text-center py-4">No chats yet</div>
          )}
          {sortedSessions.map(session => (
            <div
              key={session.id}
              className={cn(
                'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm group transition-all',
                session.id === currentSessionId
                  ? 'bg-brand-dim border border-brand/20'
                  : 'hover:bg-[var(--color-elevated)] border border-transparent',
              )}
              onClick={() => onSwitchSession(session.id)}
            >
              <div className={cn(
                'w-1 h-4 rounded-full flex-shrink-0 transition-colors',
                session.id === currentSessionId ? 'bg-brand' : 'bg-transparent group-hover:bg-zinc-700',
              )} />

              <div className="flex-1 min-w-0">
                {editingId === session.id ? (
                  <input
                    type="text"
                    value={editValue}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRenameSession(session.id, editValue || 'Chat'); setEditingId(null); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => { onRenameSession(session.id, editValue || 'Chat'); setEditingId(null); }}
                    className="w-full bg-[var(--color-base)] border border-brand rounded px-2 py-0.5 text-sm text-zinc-200 outline-none"
                    aria-label="Rename session"
                  />
                ) : (
                  <span className={cn(
                    'truncate block leading-tight',
                    session.id === currentSessionId ? 'text-brand font-medium' : 'text-zinc-400',
                  )}>
                    {session.label}
                  </span>
                )}
              </div>

              {editingId !== session.id && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(session.id); setEditValue(session.label); }}
                    className="p-1 rounded text-zinc-600 hover:text-brand hover:bg-[var(--color-inset)] transition-all"
                    aria-label="Rename session"
                  >
                    {ICONS.pencil}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                    className="p-1 rounded text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    aria-label="Delete session"
                  >
                    {ICONS.trash}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
