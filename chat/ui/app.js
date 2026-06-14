/* ── NV-Agent UI — Client-side logic ─────────────────────── */
(function () {
"use strict";

// ── Auth key storage ─────────────────────────────────────
const AUTH_KEY_STORAGE = "nv_agent_auth_key";

function getStoredAuthKey() {
  return localStorage.getItem(AUTH_KEY_STORAGE);
}

function setStoredAuthKey(key, remember) {
  if (remember) {
    localStorage.setItem(AUTH_KEY_STORAGE, key);
  } else {
    sessionStorage.setItem(AUTH_KEY_STORAGE, key);
  }
}

function clearStoredAuthKey() {
  localStorage.removeItem(AUTH_KEY_STORAGE);
  sessionStorage.removeItem(AUTH_KEY_STORAGE);
}

function getAuthKey() {
  // Check sessionStorage first (non-persistent), then localStorage
  return sessionStorage.getItem(AUTH_KEY_STORAGE) || localStorage.getItem(AUTH_KEY_STORAGE) || "";
}

// ── State ──────────────────────────────────────────────
const state = {
  sessionId: null,
  ws: null,
  streaming: false,
  sessions: [],
  authRequired: false,
  authKey: "",
};

// ── DOM refs ───────────────────────────────────────────
const $ = (s) => document.querySelector(s);

const dom = {
  sidebar: $("#sidebar"),
  sidebarToggle: $("#sidebar-toggle"),
  newSessionBtn: $("#new-session-btn"),
  sessionList: $("#session-list"),
  kbChunks: $("#kb-chunks"),
  kbReady: $("#kb-ready"),
  kbRefreshBtn: $("#kb-refresh-btn"),
  kbTextInput: $("#kb-text-input"),
  kbSourceInput: $("#kb-source-input"),
  kbIngestBtn: $("#kb-ingest-btn"),
  kbFileInput: $("#kb-file-input"),
  kbUploadBtn: $("#kb-upload-btn"),
  kbResetBtn: $("#kb-reset-btn"),
  resetModal: $("#reset-modal"),
  resetCancelBtn: $("#reset-cancel-btn"),
  resetConfirmBtn: $("#reset-confirm-btn"),
  emptyState: $("#empty-state"),
  messages: $("#messages"),
  msgInput: $("#msg-input"),
  sendBtn: $("#send-btn"),
  typingIndicator: $("#typing-indicator"),
  toastContainer: $("#toast-container"),
  // Auth
  loginModal: $("#login-modal"),
  loginForm: $("#login-form"),
  loginApiKey: $("#login-api-key"),
  loginRemember: $("#login-remember"),
  loginSubmitBtn: $("#login-submit-btn"),
};

// ── API helpers ────────────────────────────────────────
const API = "/api";

async function apiFetch(path, opts = {}) {
  // Don't set Content-Type for FormData — browser sets it with boundary
  if (!(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  }

  // Add auth key if available
  const authKey = getAuthKey();
  if (authKey) {
    opts.headers = { "X-API-Key": authKey, ...(opts.headers || {}) };
  }

  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    // If 401, auth key might be invalid/expired
    if (res.status === 401) {
      clearStoredAuthKey();
      state.authKey = "";
      showLoginModal();
    }
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// ── Toast notifications ────────────────────────────────
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Markdown rendering ─────────────────────────────────
function renderMarkdown(text) {
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text);
  }
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

// ── Session management ─────────────────────────────────
async function createSession() {
  const data = await apiFetch("/sessions", { method: "POST" });
  return data.session_id;
}

function addSessionToList(id, label) {
  state.sessions.push({ id, label });
  renderSessionList();
}

function renderSessionList() {
  dom.sessionList.innerHTML = "";
  state.sessions.forEach((s) => {
    const el = document.createElement("div");
    el.className = "session-item" + (s.id === state.sessionId ? " active" : "");
    el.innerHTML = `
      <span class="session-label">${escHtml(s.label)}</span>
      <button class="session-delete" title="Delete session">&times;</button>
    `;
    el.querySelector(".session-label").addEventListener("click", () => switchSession(s.id));
    el.querySelector(".session-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    dom.sessionList.appendChild(el);
  });
}

function switchSession(id) {
  if (state.streaming) return;
  state.sessionId = id;
  dom.messages.innerHTML = "";

  // Load persisted history, then show chat
  loadSessionHistory(id).then(() => {
    showChat();
    renderSessionList();
    connectWS();
  });
}

async function loadSessionHistory(id) {
  try {
    const data = await apiFetch("/sessions/" + id + "/history?limit=100");
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach((m) => addMessage(m.role, m.content));
    }
  } catch (e) {
    console.warn("[load-history] failed:", e);
  }
}

async function deleteSession(id) {
  try {
    await apiFetch("/sessions/" + id, { method: "DELETE" });
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (id === state.sessionId) {
      state.sessionId = null;
      dom.messages.innerHTML = "";
      showEmpty();
    }
    renderSessionList();
  } catch (e) {
    toast("Failed to delete session: " + e.message, "error");
  }
}

// ── Chat UI ────────────────────────────────────────────
function showEmpty() {
  dom.emptyState.style.display = "flex";
  dom.messages.style.display = "none";
}

function showChat() {
  dom.emptyState.style.display = "none";
  dom.messages.style.display = "block";
}

function addMessage(role, content) {
  const avatar = role === "user" ? "👤" : "🤖";
  const html = renderMarkdown(content);
  const el = document.createElement("div");
  el.className = "message " + role;
  if (role === "assistant") {
    el.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-body"><div class="message-content">${html}</div></div>
    `;
  } else {
    el.innerHTML = `
      <div class="message-content">${escHtml(content)}</div>
      <div class="message-avatar">${avatar}</div>
    `;
  }
  dom.messages.appendChild(el);
  scrollToBottom();
  return el;
}

function createStreamingMessage() {
  const el = document.createElement("div");
  el.className = "message assistant streaming";
  el.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-body">
      <details class="thinking-block" style="display:none">
        <summary class="thinking-summary">💭 Thinking…</summary>
        <div class="thinking-content"></div>
      </details>
      <div class="message-content"><span class="cursor">▌</span></div>
    </div>
  `;
  dom.messages.appendChild(el);
  scrollToBottom();
  return el;
}

function updateStreamingReasoning(el, reasoningText) {
  const block = el.querySelector(".thinking-block");
  const content = el.querySelector(".thinking-content");
  if (block) {
    block.style.display = "block";
    content.innerHTML = renderMarkdown(reasoningText);
  }
  scrollToBottom();
}

function updateStreamingMessage(el, fullText) {
  const contentEl = el.querySelector(".message-content");
  contentEl.innerHTML = renderMarkdown(fullText) + '<span class="cursor">▌</span>';
  scrollToBottom();
}

function finalizeStreamingMessage(el, fullText) {
  const contentEl = el.querySelector(".message-content");
  contentEl.innerHTML = renderMarkdown(fullText);
  const summary = el.querySelector(".thinking-summary");
  if (summary) summary.textContent = "💭 Reasoning (click to expand)";
  el.classList.remove("streaming");
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messages.scrollTop = dom.messages.scrollHeight;
  });
}

function setStreaming(on) {
  state.streaming = on;
  dom.sendBtn.disabled = on;
  dom.msgInput.disabled = on;
  dom.typingIndicator.style.display = on ? "flex" : "none";
  if (on) dom.msgInput.blur();
  else dom.msgInput.focus();
}

// ── WebSocket ──────────────────────────────────────────
function connectWS() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  // If auth is required but no key, don't connect
  if (state.authRequired && !state.authKey) {
    showLoginModal();
    return;
  }

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const authKey = getAuthKey();
  const url = `${proto}//${location.host}/api/ws/chat${authKey ? "?api_key=" + encodeURIComponent(authKey) : ""}`;

  const ws = new WebSocket(url);
  let streamEl = null;
  let streamText = "";
  let reasoningText = "";

  ws.onopen = () => {
    console.log("[ws] connected");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "session") {
      state.sessionId = msg.session_id;
      // Only add to session list if not already there (switch case)
      if (!state.sessions.find((s) => s.id === msg.session_id)) {
        addSessionToList(msg.session_id, "Chat " + state.sessions.length);
      }
      showChat();
    } else if (msg.type === "reasoning") {
      if (!streamEl) {
        streamEl = createStreamingMessage();
        streamText = "";
        reasoningText = "";
      }
      reasoningText += msg.content;
      updateStreamingReasoning(streamEl, reasoningText);
    } else if (msg.type === "token") {
      if (!streamEl) {
        streamEl = createStreamingMessage();
        streamText = "";
        reasoningText = "";
      }
      streamText += msg.content;
      updateStreamingMessage(streamEl, streamText);
    } else if (msg.type === "done") {
      if (streamEl) {
        finalizeStreamingMessage(streamEl, msg.full || streamText);
        streamEl = null;
        streamText = "";
        reasoningText = "";
      }
      setStreaming(false);
      // Update session label with first user message
      const session = state.sessions.find((s) => s.id === state.sessionId);
      if (session && session.label.startsWith("Chat ")) {
        const firstMsg = dom.messages.querySelector(".user .message-content");
        if (firstMsg) {
          session.label = firstMsg.textContent.slice(0, 30) + (firstMsg.textContent.length > 30 ? "…" : "");
          renderSessionList();
        }
      }
    } else if (msg.type === "error") {
      if (streamEl) {
        streamText += "\n\n⚠️ **Error:** " + msg.content;
        finalizeStreamingMessage(streamEl, streamText);
        streamEl = null;
        streamText = "";
        reasoningText = "";
      } else {
        toast("Error: " + msg.content, "error");
      }
      setStreaming(false);
    }
  };

  ws.onerror = () => {
    toast("WebSocket connection error", "error");
    setStreaming(false);
  };

  ws.onclose = () => {
    console.log("[ws] closed");
    state.ws = null;
    if (state.streaming) {
      setStreaming(false);
      toast("WebSocket disconnected", "info");
    }
  };

  state.ws = ws;
}

function sendViaWS(text) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast("Not connected. Reconnecting…", "info");
    connectWS();
    setTimeout(() => sendViaWS(text), 500);
    return;
  }
  state.ws.send(JSON.stringify({ message: text }));
}

// ── SSE fallback ───────────────────────────────────────
async function sendViaSSE(text) {
  setStreaming(true);
  addMessage("user", text);

  let streamEl = createStreamingMessage();
  let streamText = "";
  let reasoningText = "";

  const authKey = getAuthKey();
  const headers = { "Content-Type": "application/json" };
  if (authKey) {
    headers["X-API-Key"] = authKey;
  }

  try {
    const res = await fetch(API + "/chat/stream", {
      method: "POST",
      headers,
      body: JSON.stringify({ session_id: state.sessionId, message: text }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const d = JSON.parse(payload);
          if (d.token) {
            streamText += d.token;
            updateStreamingMessage(streamEl, streamText);
          } else if (d.reasoning) {
            reasoningText += d.reasoning;
            updateStreamingReasoning(streamEl, reasoningText);
          } else if (d.error) {
            streamText += "\n\n⚠️ **Error:** " + d.error;
            updateStreamingMessage(streamEl, streamText);
          }
        } catch {}
      }
    }

    finalizeStreamingMessage(streamEl, streamText);
  } catch (e) {
    toast("Failed to send message: " + e.message, "error");
    if (streamEl) streamEl.remove();
  } finally {
    setStreaming(false);
  }
}

// ── Send message ───────────────────────────────────────
function sendMessage() {
  const text = dom.msgInput.value.trim();
  if (!text || state.streaming) return;

  addMessage("user", text);
  dom.msgInput.value = "";
  autoResize();
  setStreaming(true);

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    sendViaWS(text);
  } else {
    if (!state.sessionId) {
      createSession().then((id) => {
        state.sessionId = id;
        addSessionToList(id, "Chat " + state.sessions.length);
        showChat();
        sendViaSSE(text);
      });
    } else {
      sendViaSSE(text);
    }
  }
}

// ── Knowledge Base ─────────────────────────────────────
async function refreshKBStatus() {
  try {
    const data = await apiFetch("/kb/status");
    dom.kbChunks.textContent = data.total_chunks;
    dom.kbReady.textContent = data.index_ready ? "✅ Ready" : "❌ Not ready";
  } catch (e) {
    dom.kbChunks.textContent = "—";
    dom.kbReady.textContent = "⚠️ Error";
  }
}

async function ingestText() {
  const text = dom.kbTextInput.value.trim();
  if (!text) { toast("Enter text to ingest", "error"); return; }
  dom.kbIngestBtn.disabled = true;
  dom.kbIngestBtn.textContent = "Ingesting…";
  try {
    const data = await apiFetch("/kb/ingest", {
      method: "POST",
      body: JSON.stringify({ text, source: dom.kbSourceInput.value.trim() || "ui-upload" }),
    });
    toast(`Added ${data.chunks_added} chunks`, "success");
    dom.kbTextInput.value = "";
    dom.kbSourceInput.value = "";
    refreshKBStatus();
  } catch (e) {
    toast("Ingest failed: " + e.message, "error");
  } finally {
    dom.kbIngestBtn.disabled = false;
    dom.kbIngestBtn.textContent = "Ingest Text";
  }
}

async function uploadFile() {
  const file = dom.kbFileInput.files[0];
  if (!file) { toast("Select a file first", "error"); return; }

  dom.kbUploadBtn.disabled = true;
  dom.kbUploadBtn.textContent = "Uploading…";

  try {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const data = await apiFetch("/kb/upload", {
      method: "POST",
      body: formData,
    });
    toast(`Indexed ${file.name}: ${data.chunks_added} chunks`, "success");
    dom.kbFileInput.value = "";
    refreshKBStatus();
  } catch (e) {
    toast("Upload failed: " + e.message, "error");
  } finally {
    dom.kbUploadBtn.disabled = false;
    dom.kbUploadBtn.textContent = "Upload & Ingest";
  }
}

async function loadPersistedSessions() {
  try {
    const data = await apiFetch("/sessions");
    if (data && data.length > 0) {
      state.sessions = data.map((s) => ({
        id: s.session_id,
        label: s.title || "Chat",
      }));
      renderSessionList();
    }
  } catch (e) {
    console.warn("[load-sessions] failed:", e);
  }
}

async function resetKB() {
  dom.resetModal.style.display = "none";
  try {
    await apiFetch("/kb/reset", { method: "DELETE" });
    toast("Knowledge base cleared", "success");
    refreshKBStatus();
  } catch (e) {
    toast("Reset failed: " + e.message, "error");
  }
}

// ── Textarea auto-resize ───────────────────────────────
function autoResize() {
  dom.msgInput.style.height = "auto";
  dom.msgInput.style.height = Math.min(dom.msgInput.scrollHeight, 120) + "px";
  dom.sendBtn.disabled = !dom.msgInput.value.trim();
}

// ── Escape HTML ────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Auth UI ────────────────────────────────────────────
function showLoginModal() {
  dom.loginModal.style.display = "flex";
  dom.loginApiKey.value = "";
  dom.loginApiKey.focus();
}

function hideLoginModal() {
  dom.loginModal.style.display = "none";
}

async function handleLogin(event) {
  event.preventDefault();
  const key = dom.loginApiKey.value.trim();
  const remember = dom.loginRemember.checked;

  if (!key) {
    toast("Please enter an API key", "error");
    return;
  }

  dom.loginSubmitBtn.disabled = true;
  dom.loginSubmitBtn.textContent = "Verifying…";

  try {
    // Test the key by calling a protected endpoint
    await apiFetch("/health/detailed", { method: "GET" });
    // If successful, store the key
    setStoredAuthKey(key, remember);
    state.authKey = key;
    state.authRequired = true;
    hideLoginModal();
    toast("Authentication successful", "success");
    // Re-initialize
    refreshKBStatus();
    loadPersistedSessions();
    connectWS();
  } catch (e) {
    toast("Invalid API key: " + e.message, "error");
  } finally {
    dom.loginSubmitBtn.disabled = false;
    dom.loginSubmitBtn.textContent = "Sign In";
  }
}

async function checkAuthRequired() {
  try {
    const data = await apiFetch("/health/detailed", { method: "GET" });
    state.authRequired = data.auth_enabled || false;
    if (state.authRequired && !getAuthKey()) {
      showLoginModal();
      return false;
    }
    state.authKey = getAuthKey() || "";
    return true;
  } catch (e) {
    console.warn("[auth] Failed to check auth status:", e);
    // Assume no auth required if we can't check
    return true;
  }
}

// ── Event listeners ───────────────────────────────────
dom.sidebarToggle.addEventListener("click", () => {
  dom.sidebar.classList.toggle("collapsed");
});

dom.newSessionBtn.addEventListener("click", () => {
  if (state.streaming) return;
  connectWS();
});

dom.sendBtn.addEventListener("click", sendMessage);

dom.msgInput.addEventListener("input", autoResize);

dom.msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

dom.kbRefreshBtn.addEventListener("click", refreshKBStatus);
dom.kbIngestBtn.addEventListener("click", ingestText);
dom.kbUploadBtn.addEventListener("click", uploadFile);

dom.kbResetBtn.addEventListener("click", () => {
  dom.resetModal.style.display = "flex";
});
dom.resetCancelBtn.addEventListener("click", () => {
  dom.resetModal.style.display = "none";
});
dom.resetConfirmBtn.addEventListener("click", resetKB);

dom.resetModal.addEventListener("click", (e) => {
  if (e.target === dom.resetModal) dom.resetModal.style.display = "none";
});

// Auth event listeners
dom.loginForm.addEventListener("submit", handleLogin);

// ── Init ───────────────────────────────────────────────
async function init() {
  const authOk = await checkAuthRequired();
  if (authOk) {
    refreshKBStatus();
    loadPersistedSessions();
    connectWS();
  }
}

init();
})();
