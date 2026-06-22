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
  lastFocusedElement: null,
  dragCounter: 0,
};

// ── DOM refs ───────────────────────────────────────────
const $ = (s) => document.querySelector(s);

const dom = {
  sidebar: $("#sidebar"),
  sidebarToggle: $("#sidebar-toggle"),
  sidebarBackdrop: $("#sidebar-backdrop"),
  sessionsSection: $("#sessions-section"),
  kbSection: $("#kb-section"),
  newSessionBtn: $("#new-session-btn"),
  sessionList: $("#session-list"),
  sessionSearch: $("#session-search"),
  sessionSearchWrap: $("#session-search-wrap"),
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
  dropzoneOverlay: $("#dropzone-overlay"),
  sidebarOpenBtn: $("#sidebar-open-btn"),
  kbIngestProgress: $("#kb-ingest-progress"),
  kbProgressBar: $("#kb-progress-bar"),
  // Auth
  loginModal: $("#login-modal"),
  loginForm: $("#login-form"),
  loginApiKey: $("#login-api-key"),
  loginRemember: $("#login-remember"),
  loginSubmitBtn: $("#login-submit-btn"),
};

// ── Icon SVGs ───────────────────────────────────────────
const ICONS = {
  userAvatar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>',
  botAvatar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  regenerate: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  pencil: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
};

// ── Utility helpers ────────────────────────────────────
function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => toast("Copied to clipboard", "success"),
    () => toast("Failed to copy", "error")
  );
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── API helpers ────────────────────────────────────────
const API = "/api";

async function apiFetch(path, opts = {}) {
  if (!(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  }
  const authKey = getAuthKey();
  if (authKey) {
    opts.headers = { "X-API-Key": authKey, ...(opts.headers || {}) };
  }
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
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
function toast(msg, type = "info", duration = 4000) {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.setAttribute("role", "alert");
  el.innerHTML = '<span>' + escHtml(msg) + '</span><div class="toast-progress" style="animation-duration:' + duration + 'ms"></div>';
  dom.toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-exit");
    setTimeout(() => el.remove(), 200);
  }, duration);
}

// ── Markdown rendering ─────────────────────────────────
function renderMarkdown(text) {
  if (!window.marked) return escHtml(text).replace(/\n/g, "<br>");

  const renderer = new marked.Renderer();

  // Code blocks: wrap in container with header
  renderer.code = function (code, language) {
    // Handle new marked.js API where code may be an object
    let src = code;
    let lang = language || "text";
    if (typeof code === "object") {
      src = code.text || "";
      lang = code.lang || language || "text";
    }
    const escaped = escHtml(src);
    return '<div class="code-block">'
      + '<div class="code-header">'
      + '<span class="code-lang">' + escHtml(lang) + '</span>'
      + '<button class="code-copy-btn" onclick="nvCopyCode(this)" aria-label="Copy code">' + ICONS.copy + ' Copy</button>'
      + '</div>'
      + '<pre><code>' + escaped + '</code></pre>'
      + '</div>';
  };

  marked.setOptions({ breaks: true, gfm: true, renderer: renderer });

  let html = marked.parse(text);

  // Post-process: convert [Source: ...] into citation badges
  html = html.replace(
    /\[Source:\s*([^\]]+)\]/g,
    function (match, p1) {
      var safe = escHtml(p1);
      return '<span class="source-citation" title="' + safe + '">' + safe + '</span>';
    }
  );

  return html;
}

// Global callback for code copy buttons (inside innerHTML)
window.nvCopyCode = function (btn) {
  const block = btn.closest(".code-block");
  if (!block) return;
  const code = block.querySelector("code");
  if (!code) return;
  copyToClipboard(code.textContent);
  const orig = btn.innerHTML;
  btn.innerHTML = ICONS.check + ' Copied';
  setTimeout(() => { btn.innerHTML = orig; }, 2000);
};

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
  const query = (dom.sessionSearch ? dom.sessionSearch.value : "").toLowerCase();
  state.sessions.forEach((s) => {
    // Filter by search
    if (query && !s.label.toLowerCase().includes(query)) return;

    const el = document.createElement("div");
    el.className = "session-item" + (s.id === state.sessionId ? " active" : "");
    el.setAttribute("role", "listitem");
    el.dataset.id = s.id;
    el.innerHTML =
      '<span class="session-label">' + escHtml(s.label) + '</span>'
      + '<button class="session-action session-rename" title="Rename" aria-label="Rename session">' + ICONS.pencil + '</button>'
      + '<button class="session-action session-delete" title="Delete" aria-label="Delete session">' + ICONS.trash + '</button>';
    el.querySelector(".session-label").addEventListener("click", () => switchSession(s.id));
    el.querySelector(".session-rename").addEventListener("click", (e) => {
      e.stopPropagation();
      startRenameSession(s.id);
    });
    el.querySelector(".session-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    dom.sessionList.appendChild(el);
  });
}

function startRenameSession(id) {
  const el = dom.sessionList.querySelector('.session-item[data-id="' + id + '"]');
  if (!el) return;
  const labelEl = el.querySelector(".session-label");
  if (!labelEl) return;

  const session = state.sessions.find((s) => s.id === id);
  const currentLabel = session ? session.label : "Chat";

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentLabel;
  input.className = "session-rename-input";
  input.setAttribute("aria-label", "Rename session");
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  function finish() {
    const newLabel = input.value.trim() || "Chat";
    if (session) session.label = newLabel;
    renderSessionList();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(); }
    if (e.key === "Escape") { renderSessionList(); }
  });
  input.addEventListener("blur", finish);
}

function switchSession(id) {
  if (state.streaming) return;

  // Close any existing WebSocket — opening a new one would create a fresh session
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  state.sessionId = id;
  dom.messages.innerHTML = "";
  loadSessionHistory(id).then(() => {
    showChat();
    renderSessionList();
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
  const avatarSvg = role === "user" ? ICONS.userAvatar : ICONS.botAvatar;
  const html = renderMarkdown(content);
  const el = document.createElement("div");
  el.className = "message " + role;

  if (role === "assistant") {
    el.innerHTML =
      '<div class="message-avatar">' + avatarSvg + '</div>'
      + '<div class="message-body">'
      + '<div class="message-content">' + html + '</div>'
      + '<div class="message-actions">'
      + '<button class="action-btn copy-btn" aria-label="Copy message">' + ICONS.copy + ' Copy</button>'
      + '<button class="action-btn regen-btn" aria-label="Regenerate response">' + ICONS.regenerate + ' Regenerate</button>'
      + '</div>'
      + '</div>';
  } else {
    el.innerHTML =
      '<div class="message-content">' + escHtml(content) + '</div>'
      + '<div class="message-avatar">' + avatarSvg + '</div>';
  }

  // Wire action buttons
  const copyBtn = el.querySelector(".copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => copyToClipboard(content));
  }
  const regenBtn = el.querySelector(".regen-btn");
  if (regenBtn) {
    regenBtn.addEventListener("click", () => regenerateLastMessage());
  }

  dom.messages.appendChild(el);
  scrollToBottom();
  return el;
}

function createStreamingMessage() {
  const el = document.createElement("div");
  el.className = "message assistant streaming";
  el.innerHTML =
    '<div class="message-avatar">' + ICONS.botAvatar + '</div>'
    + '<div class="message-body">'
    + '<details class="thinking-block" style="display:none">'
    + '<summary class="thinking-summary"><span class="thinking-pulse"></span> Thinking…</summary>'
    + '<div class="thinking-content"></div>'
    + '</details>'
    + '<div class="message-content"><span class="streaming-cursor"></span></div>'
    + '</div>';
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
  contentEl.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
  scrollToBottom();
}

function finalizeStreamingMessage(el, fullText) {
  const contentEl = el.querySelector(".message-content");
  contentEl.innerHTML = renderMarkdown(fullText);

  // Update thinking summary
  const summary = el.querySelector(".thinking-summary");
  const thinkingBlock = el.querySelector(".thinking-block");
  if (summary && thinkingBlock) {
    // Remove the pulse dot
    const pulse = summary.querySelector(".thinking-pulse");
    if (pulse) pulse.remove();
    summary.innerHTML = summary.innerHTML.replace("Thinking…", "Reasoning (click to expand)");
    // Collapse after finalization
    thinkingBlock.removeAttribute("open");
  }

  el.classList.remove("streaming");

  // Add message actions
  const body = el.querySelector(".message-body");
  if (body && !body.querySelector(".message-actions")) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML =
      '<button class="action-btn copy-btn" aria-label="Copy message">' + ICONS.copy + ' Copy</button>'
      + '<button class="action-btn regen-btn" aria-label="Regenerate response">' + ICONS.regenerate + ' Regenerate</button>';
    body.appendChild(actions);

    const copyBtn = actions.querySelector(".copy-btn");
    copyBtn.addEventListener("click", () => copyToClipboard(fullText));
    const regenBtn = actions.querySelector(".regen-btn");
    regenBtn.addEventListener("click", () => regenerateLastMessage());
  }

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

// ── Regenerate last message ──────────────────────────────
function regenerateLastMessage() {
  if (state.streaming) return;
  // Find the last user message text
  const userMsgs = dom.messages.querySelectorAll(".message.user .message-content");
  if (!userMsgs.length) return;
  const lastUserText = userMsgs[userMsgs.length - 1].textContent;

  // Remove the last assistant message from DOM
  const assistantMsgs = dom.messages.querySelectorAll(".message.assistant");
  if (assistantMsgs.length) assistantMsgs[assistantMsgs.length - 1].remove();

  // Re-send
  setStreaming(true);
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    sendViaWS(lastUserText);
  } else {
    sendViaSSE(lastUserText);
  }
}

// ── WebSocket ──────────────────────────────────────────
function connectWS() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  if (state.authRequired && !state.authKey) {
    showLoginModal();
    return;
  }

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const authKey = getAuthKey();
  const url = proto + "//" + location.host + "/api/ws/chat" + (authKey ? "?api_key=" + encodeURIComponent(authKey) : "");

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
      // Update session label
      const session = state.sessions.find((s) => s.id === state.sessionId);
      if (session && session.label.startsWith("Chat ")) {
        const firstMsg = dom.messages.querySelector(".message.user .message-content");
        if (firstMsg) {
          session.label = firstMsg.textContent.slice(0, 30) + (firstMsg.textContent.length > 30 ? "…" : "");
          renderSessionList();
        }
      }
    } else if (msg.type === "error") {
      if (streamEl) {
        streamText += "\n\n**Error:** " + msg.content;
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

  // If we don't have a session yet, create one first
  if (!state.sessionId) {
    try {
      const data = await apiFetch("/sessions", { method: "POST" });
      state.sessionId = data.session_id;
      addSessionToList(data.session_id, "Chat " + state.sessions.length);
      showChat();
    } catch (e) {
      toast("Failed to create session: " + e.message, "error");
      if (streamEl) streamEl.remove();
      setStreaming(false);
      return;
    }
  }

  try {
    let res = await fetch(API + "/chat/stream", {
      method: "POST",
      headers,
      body: JSON.stringify({ session_id: state.sessionId, message: text }),
    });

    // If session not found (e.g., expired WS session), create a new one and retry
    if (res.status === 404) {
      try {
        const data = await apiFetch("/sessions", { method: "POST" });
        state.sessionId = data.session_id;
        addSessionToList(data.session_id, "Chat " + state.sessions.length);
        res = await fetch(API + "/chat/stream", {
          method: "POST",
          headers,
          body: JSON.stringify({ session_id: state.sessionId, message: text }),
        });
      } catch (e) {
        toast("Failed to create session: " + e.message, "error");
        if (streamEl) streamEl.remove();
        setStreaming(false);
        return;
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

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
            streamText += "\n\n**Error:** " + d.error;
            updateStreamingMessage(streamEl, streamText);
          }
        } catch (e) { /* skip bad JSON */ }
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
    dom.kbReady.innerHTML = data.index_ready
      ? '<span style="color:var(--accent)">Ready</span>'
      : '<span style="color:var(--danger)">Not ready</span>';
  } catch (e) {
    dom.kbChunks.textContent = "—";
    dom.kbReady.textContent = "Error";
  }
}

function setKBProgress(on) {
  if (dom.kbIngestProgress) {
    if (on) {
      dom.kbIngestProgress.classList.add("active");
      dom.kbProgressBar.style.width = "60%";  // Animated indeterminate-like
    } else {
      dom.kbProgressBar.style.width = "100%";
      setTimeout(() => {
        dom.kbIngestProgress.classList.remove("active");
        dom.kbProgressBar.style.width = "0%";
      }, 400);
    }
  }
}

async function ingestText() {
  const text = dom.kbTextInput.value.trim();
  if (!text) { toast("Enter text to ingest", "error"); return; }
  dom.kbIngestBtn.disabled = true;
  dom.kbIngestBtn.textContent = "Ingesting…";
  setKBProgress(true);
  try {
    const data = await apiFetch("/kb/ingest", {
      method: "POST",
      body: JSON.stringify({ text, source: dom.kbSourceInput.value.trim() || "ui-upload" }),
    });
    toast("Added " + data.chunks_added + " chunks", "success");
    dom.kbTextInput.value = "";
    dom.kbSourceInput.value = "";
    refreshKBStatus();
  } catch (e) {
    toast("Ingest failed: " + e.message, "error");
  } finally {
    dom.kbIngestBtn.disabled = false;
    dom.kbIngestBtn.textContent = "Ingest Text";
    setKBProgress(false);
  }
}

async function uploadFile() {
  const file = dom.kbFileInput.files[0];
  if (!file) { toast("Select a file first", "error"); return; }
  dom.kbUploadBtn.disabled = true;
  dom.kbUploadBtn.textContent = "Uploading…";
  setKBProgress(true);
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const data = await apiFetch("/kb/upload", { method: "POST", body: formData });
    toast("Indexed " + file.name + ": " + data.chunks_added + " chunks", "success");
    dom.kbFileInput.value = "";
    refreshKBStatus();
  } catch (e) {
    toast("Upload failed: " + e.message, "error");
  } finally {
    dom.kbUploadBtn.disabled = false;
    dom.kbUploadBtn.textContent = "Upload & Ingest";
    setKBProgress(false);
  }
}

async function uploadFileFromDrop(file) {
  toast("Uploading " + file.name + "…", "info");
  setKBProgress(true);
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const data = await apiFetch("/kb/upload", { method: "POST", body: formData });
    toast("Indexed " + file.name + ": " + data.chunks_added + " chunks", "success");
    refreshKBStatus();
  } catch (e) {
    toast("Upload failed for " + file.name + ": " + e.message, "error");
  } finally {
    setKBProgress(false);
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
  setKBProgress(true);
  try {
    await apiFetch("/kb/reset", { method: "DELETE" });
    toast("Knowledge base cleared", "success");
    refreshKBStatus();
  } catch (e) {
    toast("Reset failed: " + e.message, "error");
  } finally {
    setKBProgress(false);
  }
}

// ── Textarea auto-resize ───────────────────────────────
function autoResize() {
  dom.msgInput.style.height = "auto";
  dom.msgInput.style.height = Math.min(dom.msgInput.scrollHeight, 120) + "px";
  dom.sendBtn.disabled = !dom.msgInput.value.trim();
}

// ── Modal helpers ──────────────────────────────────────
function showModal(overlayEl) {
  state.lastFocusedElement = document.activeElement;
  overlayEl.style.display = "flex";
  // Focus first input
  const input = overlayEl.querySelector("input, button");
  if (input) input.focus();
}

function hideModal(overlayEl) {
  overlayEl.style.display = "none";
  // Restore focus
  if (state.lastFocusedElement && state.lastFocusedElement.focus) {
    state.lastFocusedElement.focus();
  }
}

// Trap focus inside modal
function trapFocus(modalEl) {
  const focusable = modalEl.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  modalEl.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// ── Auth UI ────────────────────────────────────────────
function showLoginModal() {
  showModal(dom.loginModal);
  dom.loginApiKey.value = "";
}

function hideLoginModal() {
  hideModal(dom.loginModal);
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
    await apiFetch("/health/detailed", { method: "GET" });
    setStoredAuthKey(key, remember);
    state.authKey = key;
    state.authRequired = true;
    hideLoginModal();
    toast("Authentication successful", "success");
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
    return true;
  }
}

// ── Drag-and-drop ──────────────────────────────────────
function initDragAndDrop() {
  const mainEl = document.getElementById("main");
  if (!mainEl) return;

  mainEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    state.dragCounter++;
    if (dom.dropzoneOverlay) dom.dropzoneOverlay.style.display = "flex";
  });

  mainEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    state.dragCounter--;
    if (state.dragCounter <= 0) {
      state.dragCounter = 0;
      if (dom.dropzoneOverlay) dom.dropzoneOverlay.style.display = "none";
    }
  });

  mainEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  mainEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    state.dragCounter = 0;
    if (dom.dropzoneOverlay) dom.dropzoneOverlay.style.display = "none";
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const file of files) {
        await uploadFileFromDrop(file);
      }
    }
  });
}

// ── Keyboard shortcuts ─────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Escape: close any open modal
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay").forEach((m) => {
        if (m.style.display !== "none") {
          hideModal(m);
        }
      });
    }

    // Ctrl/Cmd + N: new chat
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      if (!state.streaming) connectWS();
    }

    // Ctrl/Cmd + Shift + S: toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
      e.preventDefault();
      dom.sidebar.classList.toggle("collapsed");
      document.body.classList.toggle("sidebar-collapsed", dom.sidebar.classList.contains("collapsed"));
    }

    // Ctrl/Cmd + K: focus session search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      if (dom.sessionSearch && !dom.sidebar.classList.contains("collapsed")) {
        dom.sessionSearch.focus();
      }
    }
  });
}

// ── Suggestion cards ───────────────────────────────────
function initSuggestionCards() {
  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!prompt) return;
      dom.msgInput.value = prompt;
      autoResize();
      dom.msgInput.focus();
    });
  });
}

// ── Collapsible sidebar sections ───────────────────────
function initCollapsibleSections() {
  document.querySelectorAll(".section-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const section = toggle.closest(".sidebar-section");
      if (section) {
        section.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", !section.classList.contains("collapsed"));
      }
    });
  });
}

// ── Sidebar backdrop (mobile) ──────────────────────────
function initSidebarBackdrop() {
  if (dom.sidebarBackdrop) {
    dom.sidebarBackdrop.addEventListener("click", () => {
      dom.sidebar.classList.add("collapsed");
      document.body.classList.add("sidebar-collapsed");
    });
  }
}

// ── Event listeners ───────────────────────────────────
dom.sidebarToggle.addEventListener("click", () => {
  dom.sidebar.classList.toggle("collapsed");
  document.body.classList.toggle("sidebar-collapsed", dom.sidebar.classList.contains("collapsed"));
});

// Reopen sidebar button (visible when sidebar is collapsed)
if (dom.sidebarOpenBtn) {
  dom.sidebarOpenBtn.addEventListener("click", () => {
    dom.sidebar.classList.remove("collapsed");
    document.body.classList.remove("sidebar-collapsed");
  });
}

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
  showModal(dom.resetModal);
});
dom.resetCancelBtn.addEventListener("click", () => {
  hideModal(dom.resetModal);
});
dom.resetConfirmBtn.addEventListener("click", resetKB);

dom.resetModal.addEventListener("click", (e) => {
  if (e.target === dom.resetModal) hideModal(dom.resetModal);
});

dom.loginModal.addEventListener("click", (e) => {
  if (e.target === dom.loginModal) hideModal(dom.loginModal);
});

// Session search
if (dom.sessionSearch) {
  dom.sessionSearch.addEventListener("input", debounce(function () {
    renderSessionList();
  }, 200));
}

// Auth event listeners
dom.loginForm.addEventListener("submit", handleLogin);

// Focus trap for modals
trapFocus(dom.resetModal.querySelector(".modal"));
trapFocus(dom.loginModal.querySelector(".modal"));

// ── Init ────────────────────────────────────────────────
async function init() {
  const authOk = await checkAuthRequired();
  if (authOk) {
    refreshKBStatus();
    loadPersistedSessions();
    connectWS();
  }
  initDragAndDrop();
  initKeyboardShortcuts();
  initSuggestionCards();
  initCollapsibleSections();
  initSidebarBackdrop();
}

init();
})();
