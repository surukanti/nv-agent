import { ModalOverlay } from '../shared/ModalOverlay';

interface ResetKBModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetKBModal({ open, onClose, onConfirm }: ResetKBModalProps) {
  if (!open) return null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-7 max-w-[420px] w-[90%] shadow-[0_8px_32px_rgba(0,0,0,.5)]" role="dialog" aria-modal="true" aria-label="Reset knowledge base confirmation">
        <h3 className="text-lg font-semibold mb-3">Reset Knowledge Base?</h3>
        <p className="text-sm text-zinc-400 mb-5 leading-relaxed">This will permanently delete all indexed documents and chunks. This action cannot be undone.</p>
        <div className="flex gap-2.5 justify-end">
          <button onClick={onClose} className="text-sm font-medium bg-[var(--color-elevated)] text-zinc-400 border border-[var(--color-border)] rounded-lg py-1.5 px-4 hover:text-zinc-200 transition-colors">Cancel</button>
          <button onClick={() => { onClose(); onConfirm(); }} className="text-sm font-medium bg-red-500/10 text-red-500 rounded-lg py-1.5 px-4 hover:bg-red-500 hover:text-white transition-colors">Reset</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
