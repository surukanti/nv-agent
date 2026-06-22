import { useEffect, useRef, type ReactNode } from 'react';

interface ModalOverlayProps {
  onClose: () => void;
  children: ReactNode;
}

export function ModalOverlay({ onClose, children }: ModalOverlayProps) {
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus trap + auto-focus on mount, restore on unmount
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;

    // Auto-focus first focusable element
    const content = contentRef.current;
    if (content) {
      const focusable = content.querySelector<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const content = contentRef.current;
      if (!content) return;

      const focusable = content.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previously focused element
      if (prevFocusRef.current && prevFocusRef.current.focus) {
        prevFocusRef.current.focus();
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-lg z-[9000] flex items-center justify-center"
      onClick={onClose}
    >
      <div ref={contentRef} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
