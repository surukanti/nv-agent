import { ModalOverlay } from '../shared/ModalOverlay';
import { ICONS } from '../../utils/constants';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (key: string, remember: boolean) => Promise<void>;
  verifying: boolean;
}

export function LoginModal({ open, onClose, onLogin, verifying }: LoginModalProps) {
  if (!open) return null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-7 max-w-[420px] w-[90%] shadow-[0_8px_32px_rgba(0,0,0,.5)]" role="dialog" aria-modal="true" aria-label="Authentication required">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-brand">{ICONS.lock}</span>
          <h3 className="text-lg font-semibold">Authentication Required</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-5 leading-relaxed">This NV-Agent instance requires an API key. Enter the key below to continue.</p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const key = (form.elements.namedItem('api-key') as HTMLInputElement).value;
          const remember = (form.elements.namedItem('remember') as HTMLInputElement).checked;
          try {
            await onLogin(key, remember);
          } catch (err) { /* toast already handled */ }
        }}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="api-key" className="text-xs font-medium text-zinc-500">API Key</label>
              <input id="api-key" name="api-key" type="password" placeholder="Enter your API key" required className="bg-[var(--color-base)] border border-[var(--color-border)] rounded-lg text-sm p-2.5 focus:border-brand focus:outline-none focus:shadow-[0_0_0_1px_var(--color-brand)]" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
              <input name="remember" type="checkbox" className="w-3.5 h-3.5 accent-brand" />
              <span>Remember me (store in browser)</span>
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={verifying} className="bg-brand text-black font-medium rounded-lg py-2 px-4 hover:bg-brand-hover transition-colors disabled:opacity-40">
                {verifying ? 'Verifying…' : 'Sign In'}
              </button>
            </div>
          </div>
        </form>
        <p className="text-[11px] text-zinc-500 text-center mt-4">The API key is set by the server administrator (NV_AGENT_AUTH_KEY).</p>
      </div>
    </ModalOverlay>
  );
}
