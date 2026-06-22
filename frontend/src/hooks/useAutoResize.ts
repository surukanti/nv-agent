import { useRef, useEffect } from 'react';

export function useAutoResize(maxHeight = 120) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    textarea.addEventListener('input', resize);
    return () => textarea.removeEventListener('input', resize);
  }, [maxHeight]);

  return ref;
}
