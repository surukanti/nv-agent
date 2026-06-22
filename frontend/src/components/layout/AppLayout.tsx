import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useKB } from '../../context/KBContext';
import { useToast } from '../../context/ToastContext';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useDragDrop } from '../../hooks/useDragDrop';
import { Sidebar } from '../sidebar/Sidebar';
import { SessionsSection } from '../sidebar/SessionsSection';
import { KBSection } from '../sidebar/KBSection';
import { WelcomeState } from '../chat/WelcomeState';
import { MessageList } from '../chat/MessageList';
import { InputBar } from '../chat/InputBar';
import { AgentStepIndicator } from '../chat/AgentStepIndicator';
import { ToastContainer } from '../shared/ToastContainer';
import { LoginModal } from '../modals/LoginModal';
import { ResetKBModal } from '../modals/ResetKBModal';
import { ICONS } from '../../utils/constants';

export function AppLayout() {
  const { state: authState, checkAuthRequired, closeLoginModal, login } = useAuth();
  const { state: chatState, loadSessions, newSession, switchSession, deleteSession, renameSession, sendMessage, regenerateLastMessage, connectWS, stopStreaming } = useChat();
  const { state: kbState, refreshStatus, ingestText, uploadFile, resetKB } = useKB();
  const { state: toastState } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [prefillText, setPrefillText] = useState<string | null>(null);

  // Drag and drop (native listeners attached via useDragDrop)
  const { isDragging } = useDragDrop(mainRef, uploadFile);

  // Init
  useEffect(() => {
    checkAuthRequired().then((ok) => {
      if (ok) {
        refreshStatus();
        loadSessions();
        connectWS();
      }
    });
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewChat: () => { if (!chatState.streaming) newSession(); },
    onToggleSidebar: () => setSidebarOpen(p => !p),
    onFocusSearch: () => { if (sidebarOpen && searchInputRef.current) searchInputRef.current.focus(); },
    onCloseModal: () => { closeLoginModal(); setResetModalOpen(false); },
  });

  return (
    <div className="flex h-screen bg-[var(--color-base)] text-zinc-200">
      {/* ── Sidebar ── */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} kbStatus={kbState.status}>
        <SessionsSection
          sessions={chatState.sessions}
          currentSessionId={chatState.currentSessionId}
          streaming={chatState.streaming}
          onSwitchSession={switchSession}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onNewSession={newSession}
          searchRef={searchInputRef}
        />
        <KBSection
          status={kbState.status}
          loading={kbState.loading}
          onRefreshStatus={refreshStatus}
          onIngestText={ingestText}
          onUploadFile={uploadFile}
          onResetKB={() => setResetModalOpen(true)}
        />
      </Sidebar>

      {/* ── Main Area ── */}
      <main ref={mainRef} className="flex-1 flex flex-col min-w-0 relative">
        {/* Reopen sidebar button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-3.5 left-3.5 z-50 p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-zinc-400 hover:text-zinc-200 shadow-md hover:bg-[var(--color-elevated)] transition-colors"
            aria-label="Open sidebar"
          >
            {ICONS.hamburger}
          </button>
        )}

        {/* Dropzone overlay — glassmorphic */}
        {isDragging && (
          <div className="fixed inset-0 bg-gradient-to-br from-brand/5 to-brand/10 border-2 border-dashed border-brand/50 rounded-2xl flex items-center justify-center z-[10000] backdrop-blur-md">
            <div className="flex flex-col items-center gap-3 text-brand text-base font-medium">
              {ICONS.upload}
              <p>Drop file here to add to Knowledge Base</p>
            </div>
          </div>
        )}

        {/* Chat or Welcome */}
        {chatState.messages.length === 0 && !chatState.currentSessionId ? (
          <WelcomeState onSuggestionClick={(text) => setPrefillText(text)} kbStatus={kbState.status} />
        ) : (
          <MessageList
            messages={chatState.messages}
            streaming={chatState.streaming}
            streamingContent={chatState.streamingContent}
            streamingReasoning={chatState.streamingReasoning}
            agentStep={chatState.agentStep}
            onRegenerate={regenerateLastMessage}
          />
        )}

        {/* Agent Step Indicator */}
        {chatState.streaming && chatState.agentStep !== 'idle' && (
          <AgentStepIndicator step={chatState.agentStep} />
        )}

        {/* Input Bar */}
        <InputBar
          disabled={chatState.streaming}
          streaming={chatState.streaming}
          onSend={(text) => sendMessage(text)}
          onStop={stopStreaming}
          prefillValue={prefillText}
          onPrefillConsumed={() => setPrefillText(null)}
        />
      </main>

      {/* Toast container */}
      <ToastContainer toasts={toastState.toasts} />

      {/* Login Modal */}
      <LoginModal
        open={authState.loginModalOpen}
        onClose={closeLoginModal}
        onLogin={login}
        verifying={authState.verifying}
      />

      {/* Reset KB Modal */}
      <ResetKBModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={resetKB}
      />
    </div>
  );
}
