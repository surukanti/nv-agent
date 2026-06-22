import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import { apiFetch } from '../services/api';
import type { KBStatus, IngestResponse } from '../types/api';
import { useToast } from './ToastContext';

interface KBState {
  status: KBStatus | null;
  loading: boolean;
}

type KBAction =
  | { type: 'SET_STATUS'; status: KBStatus }
  | { type: 'SET_LOADING'; loading: boolean };

const initialState: KBState = {
  status: null,
  loading: false,
};

function reducer(state: KBState, action: KBAction): KBState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

interface KBContextValue {
  state: KBState;
  refreshStatus: () => Promise<void>;
  ingestText: (text: string, source: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  resetKB: () => Promise<void>;
}

const KBContext = createContext<KBContextValue | null>(null);

export function KBProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { toast } = useToast();

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiFetch<KBStatus>('/kb/status');
      dispatch({ type: 'SET_STATUS', status: data });
    } catch {
      dispatch({ type: 'SET_STATUS', status: { total_chunks: 0, index_ready: false } });
    }
  }, []);

  const ingestText = useCallback(async (text: string, source: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const data = await apiFetch<IngestResponse>('/kb/ingest', {
        method: 'POST',
        body: JSON.stringify({ text, source: source || 'ui-upload' }),
      });
      toast(`Added ${data.chunks_added} chunks`, 'success');
      await refreshStatus();
    } catch (e) {
      toast(`Ingest failed: ${(e as Error).message}`, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [toast, refreshStatus]);

  const uploadFile = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const data = await apiFetch<IngestResponse>('/kb/upload', {
        method: 'POST',
        body: formData,
      });
      toast(`Indexed ${file.name}: ${data.chunks_added} chunks`, 'success');
      await refreshStatus();
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [toast, refreshStatus]);

  const resetKB = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await apiFetch('/kb/reset', { method: 'DELETE' });
      toast('Knowledge base cleared', 'success');
      await refreshStatus();
    } catch (e) {
      toast(`Reset failed: ${(e as Error).message}`, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [toast, refreshStatus]);

  return (
    <KBContext.Provider value={{ state, refreshStatus, ingestText, uploadFile, resetKB }}>
      {children}
    </KBContext.Provider>
  );
}

export function useKB(): KBContextValue {
  const ctx = useContext(KBContext);
  if (!ctx) throw new Error('useKB must be used within KBProvider');
  return ctx;
}
