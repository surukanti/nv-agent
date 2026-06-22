import { useEffect, useRef } from 'react';
import type { Message, AgentStep } from '../../types/chat';
import { MessageItem } from './MessageItem';
import { StreamingMessage } from './StreamingMessage';

interface MessageListProps {
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  agentStep: AgentStep;
  onRegenerate: () => void;
}

export function MessageList({ messages, streaming, streamingContent, streamingReasoning, agentStep, onRegenerate }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingReasoning]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-6" role="log" aria-label="Chat messages" aria-live="polite">
      {messages.map(msg => (
        <MessageItem key={msg.id} message={msg} onRegenerate={onRegenerate} />
      ))}
      {streaming && (
        <StreamingMessage content={streamingContent} reasoning={streamingReasoning} agentStep={agentStep} />
      )}
    </div>
  );
}
