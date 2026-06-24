import { createContext, useContext, useReducer, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { apiFetch, getAuthKey } from '../services/api';
import type { Session, HistoryMessage } from '../types/api';
import type { Message, AgentStep } from '../types/chat';
import { useToast } from './ToastContext';

interface ChatState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  agentStep: AgentStep;
}

type ChatAction =
  | { type: 'SET_SESSIONS'; sessions: Session[] }
  | { type: 'ADD_SESSION'; session: Session }
  | { type: 'REMOVE_SESSION'; id: string }
  | { type: 'UPDATE_SESSION_LABEL'; id: string; label: string }
  | { type: 'SET_CURRENT_SESSION'; id: string | null }
  | { type: 'SET_MESSAGES'; messages: Message[] }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'REMOVE_LAST_ASSISTANT_MESSAGE' }
  | { type: 'START_STREAMING' }
  | { type: 'APPEND_TOKEN'; content: string }
  | { type: 'APPEND_REASONING'; content: string }
  | { type: 'FINALIZE_STREAMING' }
  | { type: 'STOP_STREAMING' }
  | { type: 'SET_AGENT_STEP'; step: AgentStep };

const initialState: ChatState = {
  sessions: [],
  currentSessionId: null,
  messages: [],
  streaming: false,
  streamingContent: '',
  streamingReasoning: '',
  agentStep: 'idle',
};

function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.session] };
    case 'REMOVE_SESSION':
      return { ...state, sessions: state.sessions.filter(s => s.id !== action.id) };
    case 'UPDATE_SESSION_LABEL':
      return {
        ...state,
        sessions: state.sessions.map(s => s.id === action.id ? { ...s, label: action.label } : s),
      };
    case 'SET_CURRENT_SESSION':
      return { ...state, currentSessionId: action.id };
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'REMOVE_LAST_ASSISTANT_MESSAGE': {
      let idx = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'assistant') { idx = i; break; }
      }
      return {
        ...state,
        messages: idx >= 0 ? state.messages.slice(0, idx) : state.messages,
      };
    }
    case 'START_STREAMING':
      return { ...state, streaming: true, streamingContent: '', streamingReasoning: '', agentStep: 'searching' };
    case 'APPEND_TOKEN':
      return { ...state, streamingContent: state.streamingContent + action.content, agentStep: 'writing' };
    case 'APPEND_REASONING':
      return { ...state, streamingReasoning: state.streamingReasoning + action.content, agentStep: state.agentStep === 'writing' ? 'writing' : 'thinking' };
    case 'FINALIZE_STREAMING': {
      const reasoning = state.streamingReasoning;
      const fullMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: state.streamingContent,
        timestamp: Date.now(),
        ...(reasoning ? { reasoning } : {}),
      };
      return {
        ...state,
        streaming: false,
        streamingContent: '',
        streamingReasoning: '',
        agentStep: 'idle',
        messages: [...state.messages, fullMessage],
      };
    }
    case 'STOP_STREAMING':
      return { ...state, streaming: false, streamingContent: '', streamingReasoning: '', agentStep: 'idle' };
    case 'SET_AGENT_STEP':
      return { ...state, agentStep: action.step };
    default:
      return state;
  }
}

interface ChatContextValue {
  state: ChatState;
  loadSessions: () => Promise<void>;
  newSession: () => void;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, label: string) => void;
  sendMessage: (text: string) => void;
  regenerateLastMessage: () => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  connectWS: () => void;
  stopStreaming: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // Keep a live ref to state so closures in WS/SSE handlers always read current values
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<Array<{ session_id: string; title: string | null }>>('/sessions');
      dispatch({
        type: 'SET_SESSIONS',
        sessions: data.map(s => ({ id: s.session_id, label: s.title || 'Chat' })),
      });
    } catch (e) {
      console.warn('[load-sessions] failed:', e);
    }
  }, []);

  const connectWS = useCallback((sessionId?: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const authKey = getAuthKey();
    const params = new URLSearchParams();
    if (authKey) params.set('api_key', authKey);
    if (sessionId) params.set('session_id', sessionId);
    const url = `${proto}//${location.host}/api/ws/chat?${params.toString()}`;

    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const s = stateRef.current;

      if (msg.type === 'session') {
        dispatch({ type: 'SET_CURRENT_SESSION', id: msg.session_id });
        if (!s.sessions.find(sess => sess.id === msg.session_id)) {
          dispatch({ type: 'ADD_SESSION', session: { id: msg.session_id, label: `Chat ${s.sessions.length}` } });
        }
      } else if (msg.type === 'reasoning') {
        dispatch({ type: 'APPEND_REASONING', content: msg.content });
      } else if (msg.type === 'token') {
        dispatch({ type: 'APPEND_TOKEN', content: msg.content });
      } else if (msg.type === 'done') {
        dispatch({ type: 'FINALIZE_STREAMING' });
        // Update session label if still default
        const cur = stateRef.current;
        const session = cur.sessions.find(sess => sess.id === cur.currentSessionId);
        if (session && session.label.startsWith('Chat ')) {
          const firstMsg = cur.messages.find(m => m.role === 'user');
          if (firstMsg) {
            const label = firstMsg.content.slice(0, 30) + (firstMsg.content.length > 30 ? '…' : '');
            dispatch({ type: 'UPDATE_SESSION_LABEL', id: cur.currentSessionId!, label });
          }
        }
      } else if (msg.type === 'error') {
        if (stateRef.current.streaming) {
          dispatch({ type: 'APPEND_TOKEN', content: `\n\n**Error:** ${msg.content || 'Unknown error'}` });
          dispatch({ type: 'FINALIZE_STREAMING' });
        }
        toast(`Error: ${msg.content || 'Unknown error'}`, 'error');
      }
    };

    ws.onerror = () => {
      toast('WebSocket connection error', 'error');
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (stateRef.current.streaming) {
        dispatch({ type: 'STOP_STREAMING' });
        toast('WebSocket disconnected', 'info');
      }
    };

    wsRef.current = ws;
  }, [toast]);

  const newSession = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // Don't pass sessionId — backend will create a new session
    connectWS();
  }, [connectWS]);

  const switchSession = useCallback(async (id: string) => {
    if (stateRef.current.streaming) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    dispatch({ type: 'SET_CURRENT_SESSION', id });
    dispatch({ type: 'SET_MESSAGES', messages: [] });

    try {
      const data = await apiFetch<{ messages: HistoryMessage[] }>(`/sessions/${id}/history?limit=100`);
      const messages: Message[] = (data.messages || []).map(m => ({
        id: `hist-${Math.random().toString(36).slice(2)}`,
        role: m.role,
        content: m.content,
        timestamp: undefined,
      }));
      dispatch({ type: 'SET_MESSAGES', messages });
      // Reconnect WebSocket with this session ID
      connectWS(id);
    } catch (e) {
      console.warn('[load-history] failed:', e);
    }
  }, [connectWS]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await apiFetch(`/sessions/${id}`, { method: 'DELETE' });
      dispatch({ type: 'REMOVE_SESSION', id });
      const s = stateRef.current;
      if (id === s.currentSessionId) {
        dispatch({ type: 'SET_CURRENT_SESSION', id: null });
        dispatch({ type: 'SET_MESSAGES', messages: [] });
      }
    } catch (e) {
      throw e;
    }
  }, []);

  const renameSession = useCallback((id: string, label: string) => {
    dispatch({ type: 'UPDATE_SESSION_LABEL', id, label });
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    dispatch({ type: 'ADD_MESSAGE', message: { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, content, timestamp: Date.now() } });
  }, []);

  const stopStreaming = useCallback(() => {
    dispatch({ type: 'STOP_STREAMING' });
  }, []);

  async function sendViaSSE(text: string) {
    dispatch({ type: 'ADD_MESSAGE', message: { id: `msg-${Date.now()}-user`, role: 'user', content: text, timestamp: Date.now() } });
    dispatch({ type: 'START_STREAMING' });

    let sessionId = stateRef.current.currentSessionId;
    if (!sessionId) {
      try {
        const data = await apiFetch<{ session_id: string }>('/sessions', { method: 'POST' });
        sessionId = data.session_id;
        dispatch({ type: 'SET_CURRENT_SESSION', id: sessionId });
        dispatch({ type: 'ADD_SESSION', session: { id: sessionId, label: `Chat ${stateRef.current.sessions.length}` } });
      } catch (e) {
        dispatch({ type: 'STOP_STREAMING' });
        throw e;
      }
    }

    const authKey = getAuthKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authKey) headers['X-API-Key'] = authKey;

    try {
      let res = await fetch(`/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });

      if (res.status === 404) {
        const data = await apiFetch<{ session_id: string }>('/sessions', { method: 'POST' });
        sessionId = data.session_id;
        dispatch({ type: 'SET_CURRENT_SESSION', id: sessionId });
        dispatch({ type: 'ADD_SESSION', session: { id: sessionId, label: `Chat ${stateRef.current.sessions.length}` } });

        res = await fetch(`/api/chat/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ session_id: sessionId, message: text }),
        });
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const d = JSON.parse(payload);
            if (d.token) dispatch({ type: 'APPEND_TOKEN', content: d.token });
            else if (d.reasoning) dispatch({ type: 'APPEND_REASONING', content: d.reasoning });
            else if (d.error) dispatch({ type: 'APPEND_TOKEN', content: `\n\n**Error:** ${d.error}` });
          } catch { /* skip bad JSON */ }
        }
      }

      dispatch({ type: 'FINALIZE_STREAMING' });
    } catch (e) {
      dispatch({ type: 'STOP_STREAMING' });
      throw e;
    }
  }

  const sendMessage = useCallback((text: string) => {
    dispatch({ type: 'ADD_MESSAGE', message: { id: `msg-${Date.now()}-user`, role: 'user', content: text, timestamp: Date.now() } });
    dispatch({ type: 'START_STREAMING' });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message: text }));
    } else {
      sendViaSSE(text);
    }
  }, []);

  const regenerateLastMessage = useCallback(() => {
    const s = stateRef.current;
    if (s.streaming) return;
    const lastUserMsg = [...s.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    dispatch({ type: 'REMOVE_LAST_ASSISTANT_MESSAGE' });
    dispatch({ type: 'START_STREAMING' });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message: lastUserMsg.content }));
    } else {
      sendViaSSE(lastUserMsg.content);
    }
  }, []);

  return (
    <ChatContext.Provider value={{
      state,
      loadSessions,
      newSession,
      switchSession,
      deleteSession,
      renameSession,
      sendMessage,
      regenerateLastMessage,
      addMessage,
      connectWS,
      stopStreaming,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
