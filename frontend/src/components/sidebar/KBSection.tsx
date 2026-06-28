import { useState, useRef, useEffect } from 'react';
import type { KBStatus } from '../../types/api';
import { ICONS, SUPPORTED_EXTENSIONS } from '../../utils/constants';
import { cn } from '../../utils/cn';

interface KBSectionProps {
  status: KBStatus | null;
  loading: boolean;
  onRefreshStatus: () => void;
  onIngestText: (text: string, source: string) => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
  onResetKB: () => void;
}

export function KBSection({
  status,
  loading,
  onRefreshStatus,
  onIngestText,
  onUploadFile,
  onResetKB,
}: KBSectionProps) {
  const [kbText, setKbText] = useState('');
  const [kbSource, setKbSource] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedAction, setExpandedAction] = useState<'text' | 'upload' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progress bar animation
  const [progressWidth, setProgressWidth] = useState('0%');
  const prevLoadingRef = useRef(loading);

  useEffect(() => {
    if (loading && !prevLoadingRef.current) {
      setProgressWidth('60%');
    } else if (!loading && prevLoadingRef.current) {
      setProgressWidth('100%');
      const timer = setTimeout(() => setProgressWidth('0%'), 500);
      return () => clearTimeout(timer);
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const handleIngestText = async () => {
    if (!kbText.trim() || ingesting) return;
    setIngesting(true);
    try {
      await onIngestText(kbText, kbSource);
      setKbText('');
      setKbSource('');
      setExpandedAction(null);
    } finally {
      setIngesting(false);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    try {
      await onUploadFile(selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setExpandedAction(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="px-3 py-3">
      {/* Status Card */}
      <div className="bg-[var(--color-base)] border border-[var(--color-border)] rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Knowledge Base</span>
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
            status?.index_ready ? 'bg-brand-dim text-brand' : 'bg-red-500/10 text-red-400',
          )}>
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              status?.index_ready ? 'bg-brand' : 'bg-red-500',
            )} />
            {status?.index_ready ? 'Ready' : 'Not Ready'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-zinc-200 tabular-nums">{status?.total_chunks ?? '—'}</span>
          <span className="text-xs text-zinc-600">chunks indexed</span>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-[var(--color-inset)] rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-brand rounded-full transition-[width] duration-300 ease-out"
            style={{ width: progressWidth }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => setExpandedAction(expandedAction === 'text' ? null : 'text')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            expandedAction === 'text' ? 'bg-brand-dim text-brand border border-brand/20' : 'bg-[var(--color-elevated)] text-zinc-400 border border-[var(--color-border)] hover:text-zinc-200',
          )}
        >
          {ICONS.document}
          <span className="flex-1 text-left">Add Text</span>
          <span className={cn('text-[10px] transition-transform', expandedAction === 'text' && 'rotate-90')}>▸</span>
        </button>
        {expandedAction === 'text' && (
          <div className="flex flex-col gap-2 pt-1 px-1">
            <textarea
              placeholder="Paste text to add…"
              rows={3}
              value={kbText}
              onChange={e => setKbText(e.target.value)}
              className="bg-[var(--color-base)] border border-[var(--color-border)] rounded-lg text-sm p-2.5 resize-y focus:border-brand focus:outline-none"
            />
            <input
              type="text"
              placeholder="Source label (optional)"
              value={kbSource}
              onChange={e => setKbSource(e.target.value)}
              className="bg-[var(--color-base)] border border-[var(--color-border)] rounded-lg text-sm p-2.5 focus:border-brand focus:outline-none"
            />
            <button
              onClick={handleIngestText}
              disabled={!kbText.trim() || loading || ingesting}
              className="text-sm font-medium bg-brand text-black rounded-lg py-1.5 px-3 hover:bg-brand-hover transition-colors disabled:opacity-40"
            >
              {ingesting ? 'Ingesting…' : 'Ingest Text'}
            </button>
          </div>
        )}

        <button
          onClick={() => setExpandedAction(expandedAction === 'upload' ? null : 'upload')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            expandedAction === 'upload' ? 'bg-brand-dim text-brand border border-brand/20' : 'bg-[var(--color-elevated)] text-zinc-400 border border-[var(--color-border)] hover:text-zinc-200',
          )}
        >
          {ICONS.upload}
          <span className="flex-1 text-left">Upload File</span>
          <span className={cn('text-[10px] transition-transform', expandedAction === 'upload' && 'rotate-90')}>▸</span>
        </button>
        {expandedAction === 'upload' && (
          <div className="flex flex-col gap-2 pt-1 px-1">
            <label className="relative cursor-pointer">
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_EXTENSIONS}
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                className="sr-only"
                aria-label="Choose file to upload"
              />
              <span className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-border)] text-sm text-zinc-300 hover:border-brand/50 hover:bg-[var(--color-base)] transition-colors">
                {ICONS.upload}
                <span>Choose file…</span>
              </span>
            </label>
            {selectedFile && (
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="flex-1 truncate text-[11px] text-zinc-500">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Remove selected file"
                >
                  ✕
                </button>
              </div>
            )}
            <button
              onClick={handleUploadFile}
              disabled={!selectedFile || loading || uploading}
              className="text-sm font-medium bg-brand text-black rounded-lg py-1.5 px-3 hover:bg-brand-hover transition-colors disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : 'Upload & Ingest'}
            </button>
          </div>
        )}
      </div>

      {/* Refresh + Reset row */}
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={onRefreshStatus}
          disabled={loading}
          className="flex-1 text-[11px] font-medium bg-[var(--color-elevated)] text-zinc-500 border border-[var(--color-border)] rounded-lg py-1.5 px-2 hover:text-zinc-300 transition-colors disabled:opacity-40"
        >
          Refresh
        </button>
        <button
          onClick={onResetKB}
          disabled={loading}
          className="flex-1 text-[11px] font-medium bg-red-500/5 text-red-500/70 border border-red-500/10 rounded-lg py-1.5 px-2 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
