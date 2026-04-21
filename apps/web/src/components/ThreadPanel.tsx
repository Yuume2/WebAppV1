import { useRef, useEffect } from 'react';
import type { ChatWindow, Message, AIProvider } from '@webapp/types';
import { s, PROVIDER_COLORS } from '@/app/ws-styles';

function ProviderTag({ provider }: { provider: AIProvider }) {
  const color = PROVIDER_COLORS[provider];
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, color,
      background: `${color}18`, borderRadius: '4px',
      padding: '0.1rem 0.4rem',
    }}>
      {provider}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface Props {
  selCW: ChatWindow | null;
  messages: Message[];
  newMessage: string;
  onNewMessage: (v: string) => void;
  onSendMessage: () => void;
  pending: boolean;
  error: string | null;
}

export function ThreadPanel({ selCW, messages, newMessage, onNewMessage, onSendMessage, pending, error }: Props) {
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // scroll to bottom when window changes or new messages arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length, selCW?.id]);

  // auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [newMessage]);

  if (!selCW) {
    return (
      <div style={s.main}>
        <div style={s.threadEmpty}>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ ...s.muted, color: '#52525b', marginBottom: '0.3rem' }}>No chat window selected.</p>
            <p style={{ ...s.muted, fontSize: '0.75rem', color: '#3d3d4d' }}>Choose a window from the list or create a new one.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.main}>
      <div style={s.threadHeader}>
        <span style={s.threadTitle}>{selCW.title}</span>
        <ProviderTag provider={selCW.provider} />
        <span style={s.threadMeta}>{selCW.model}</span>
      </div>

      <div style={s.thread} ref={threadRef}>
        {messages.length === 0 && (
          <p style={{ ...s.muted, padding: '0.5rem 0' }}>No messages yet — type below to start.</p>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : s.msgOther) }}>
            <span style={s.msgMeta}>
              <span style={s.msgRole}>{m.role}</span>
              <span style={s.msgTime}>{formatTime(m.createdAt)}</span>
            </span>
            <span style={s.msgContent}>{m.content}</span>
          </div>
        ))}
      </div>

      {error && <p style={{ ...s.errText, margin: '0', padding: '0.3rem 1.25rem 0' }}>{error}</p>}
      <div style={s.composer}>
        <textarea
          ref={taRef}
          style={s.composerInput}
          rows={1}
          placeholder={`Message… (Enter to send, Shift+Enter for newline)`}
          value={newMessage}
          onChange={e => onNewMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!pending && newMessage.trim()) onSendMessage();
            }
          }}
          disabled={pending}
        />
        <button
          style={{ ...s.btn, padding: '0.55rem 1.1rem' }}
          onClick={onSendMessage}
          disabled={pending || !newMessage.trim()}
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
