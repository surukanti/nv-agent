import { API_BASE, AUTH_KEY_STORAGE } from '../utils/constants';

export function getAuthKey(): string {
  return sessionStorage.getItem(AUTH_KEY_STORAGE) || localStorage.getItem(AUTH_KEY_STORAGE) || '';
}

export function setStoredAuthKey(key: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(AUTH_KEY_STORAGE, key);
  } else {
    sessionStorage.setItem(AUTH_KEY_STORAGE, key);
  }
}

export function clearStoredAuthKey(): void {
  localStorage.removeItem(AUTH_KEY_STORAGE);
  sessionStorage.removeItem(AUTH_KEY_STORAGE);
}

let onAuthFailed: (() => void) | null = null;

export function registerAuthFailedHandler(handler: () => void): void {
  onAuthFailed = handler;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  }

  const authKey = getAuthKey();
  if (authKey) {
    opts.headers = { 'X-API-Key': authKey, ...(opts.headers as Record<string, string> || {}) };
  }

  const res = await fetch(API_BASE + path, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    if (res.status === 401) {
      clearStoredAuthKey();
      onAuthFailed?.();
    }
    throw new Error(err.detail || res.statusText);
  }

  return res.json();
}
