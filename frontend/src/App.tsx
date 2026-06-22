import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { KBProvider } from './context/KBContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ChatProvider>
          <KBProvider>
            <AppLayout />
          </KBProvider>
        </ChatProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
