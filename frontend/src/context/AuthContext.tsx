import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import { apiFetch, getAuthKey, setStoredAuthKey, clearStoredAuthKey, registerAuthFailedHandler } from '../services/api';
import type { HealthDetailed } from '../types/api';

interface AuthState {
  authKey: string;
  authRequired: boolean;
  loginModalOpen: boolean;
  verifying: boolean;
}

type AuthAction =
  | { type: 'SET_AUTH_KEY'; key: string }
  | { type: 'SET_AUTH_REQUIRED'; required: boolean }
  | { type: 'OPEN_LOGIN_MODAL' }
  | { type: 'CLOSE_LOGIN_MODAL' }
  | { type: 'SET_VERIFYING'; verifying: boolean };

const initialState: AuthState = {
  authKey: getAuthKey(),
  authRequired: false,
  loginModalOpen: false,
  verifying: false,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_AUTH_KEY':
      return { ...state, authKey: action.key };
    case 'SET_AUTH_REQUIRED':
      return { ...state, authRequired: action.required };
    case 'OPEN_LOGIN_MODAL':
      return { ...state, loginModalOpen: true };
    case 'CLOSE_LOGIN_MODAL':
      return { ...state, loginModalOpen: false };
    case 'SET_VERIFYING':
      return { ...state, verifying: action.verifying };
    default:
      return state;
  }
}

interface AuthContextValue {
  state: AuthState;
  login: (key: string, remember: boolean) => Promise<void>;
  logout: () => void;
  checkAuthRequired: () => Promise<boolean>;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Register handler so apiFetch can trigger login modal on 401
  useEffect(() => {
    registerAuthFailedHandler(() => {
      dispatch({ type: 'SET_AUTH_KEY', key: '' });
      dispatch({ type: 'OPEN_LOGIN_MODAL' });
    });
  }, []);

  const login = useCallback(async (key: string, remember: boolean) => {
    dispatch({ type: 'SET_VERIFYING', verifying: true });
    try {
      setStoredAuthKey(key, remember);
      await apiFetch<HealthDetailed>('/health/detailed', { method: 'GET' });
      dispatch({ type: 'SET_AUTH_KEY', key });
      dispatch({ type: 'SET_AUTH_REQUIRED', required: true });
      dispatch({ type: 'CLOSE_LOGIN_MODAL' });
    } catch {
      clearStoredAuthKey();
      throw new Error('Invalid API key');
    } finally {
      dispatch({ type: 'SET_VERIFYING', verifying: false });
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredAuthKey();
    dispatch({ type: 'SET_AUTH_KEY', key: '' });
    dispatch({ type: 'OPEN_LOGIN_MODAL' });
  }, []);

  const checkAuthRequired = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiFetch<HealthDetailed>('/health/detailed', { method: 'GET' });
      const required = data.auth_enabled || false;
      dispatch({ type: 'SET_AUTH_REQUIRED', required });
      if (required && !getAuthKey()) {
        dispatch({ type: 'OPEN_LOGIN_MODAL' });
        return false;
      }
      dispatch({ type: 'SET_AUTH_KEY', key: getAuthKey() });
      return true;
    } catch {
      return true; // Assume no auth if we can't check
    }
  }, []);

  const openLoginModal = useCallback(() => dispatch({ type: 'OPEN_LOGIN_MODAL' }), []);
  const closeLoginModal = useCallback(() => dispatch({ type: 'CLOSE_LOGIN_MODAL' }), []);

  return (
    <AuthContext.Provider value={{ state, login, logout, checkAuthRequired, openLoginModal, closeLoginModal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
