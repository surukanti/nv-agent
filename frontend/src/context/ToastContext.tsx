import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { ToastType, ToastItem } from '../types/chat';

interface ToastState {
  toasts: ToastItem[];
}

type ToastAction =
  | { type: 'ADD_TOAST'; toast: ToastItem }
  | { type: 'REMOVE_TOAST'; id: string }
  | { type: 'MARK_EXITING'; id: string };

const initialState: ToastState = { toasts: [] };

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case 'MARK_EXITING':
      return {
        ...state,
        toasts: state.toasts.map(t => t.id === action.id ? { ...t, exiting: true } : t),
      };
    default:
      return state;
  }
}

interface ToastContextValue {
  state: ToastState;
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, type, duration } });

    setTimeout(() => {
      dispatch({ type: 'MARK_EXITING', id });
      setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 200);
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ state, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
