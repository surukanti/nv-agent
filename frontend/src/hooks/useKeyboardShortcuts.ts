import { useEffect, useRef } from 'react';

interface KeyboardShortcutDeps {
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onFocusSearch: () => void;
  onCloseModal: () => void;
}

export function useKeyboardShortcuts(deps: KeyboardShortcutDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Escape: close modals
      if (e.key === 'Escape') {
        depsRef.current.onCloseModal();
      }

      // Ctrl/Cmd + N: new chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        depsRef.current.onNewChat();
      }

      // Ctrl/Cmd + Shift + S: toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        depsRef.current.onToggleSidebar();
      }

      // Ctrl/Cmd + K: focus session search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        depsRef.current.onFocusSearch();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
