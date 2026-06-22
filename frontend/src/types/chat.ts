export type AgentStep = 'idle' | 'searching' | 'thinking' | 'writing';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp?: number;
}

export interface WSMessage {
  type: 'session' | 'token' | 'reasoning' | 'done' | 'error';
  session_id?: string;
  content?: string;
  full?: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  exiting?: boolean;
}
