export interface Session {
  id: string;
  label: string;
}

export interface KBStatus {
  total_chunks: number;
  index_ready: boolean;
}

export interface IngestResponse {
  chunks_added: number;
}

export interface HealthDetailed {
  status: string;
  version: string;
  kb_chunks: number;
  kb_index_ready: boolean;
  chat_model: string;
  embedding_model: string;
  embedding_dim: number;
  active_sessions: number;
  auth_enabled: boolean;
  rate_limit: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionHistory {
  session_id: string;
  title: string | null;
  messages: HistoryMessage[];
}
