import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';

export function useClipboard() {
  const { toast } = useToast();

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard', 'success');
      return true;
    } catch {
      toast('Failed to copy', 'error');
      return false;
    }
  }, [toast]);

  return copy;
}
