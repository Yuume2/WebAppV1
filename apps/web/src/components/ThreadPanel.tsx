import type { RefObject } from 'react';
import type { ChatWindow, Message } from '@webapp/types';
import { s } from '@/app/ws-styles';

interface Props {
  selCW: ChatWindow | null;
  messages: Message[];
  newMessage: string;
  onNewMessage: (v: string) => void;
  onSendMessage: () => void;
  threadRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
}

export function ThreadPanel({ selCW, messages, newMessage, onNewMessage, onSendMessage, threadRef, busy }: Props) {
  if (!selCW) {
    return (
      <div style={s.main}>
        <div style={s.threadEmpty}>
          <p style={s.muted}>Select a chat window to start.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.main}>
      <div style={s.threadHeader}>
        <span style={s.threadTitle}>{selCW.title}</span>
        <span style={s.threadMeta}>{selCW.provider} · {selCW.model}</span>
      </div>

      <div style={s.thread} ref={threadRef}>
        {messages.length === 0 && (
          <p style={{ ...s.muted, padding: '0.5rem 0' }}>No messages yet — type below to start.</p>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : s.msgOther) }}>
            <span style={s.msgRole}>{m.role}</span>
            <span style={s.msgContent}>{m.content}</span>
          </div>
        ))}
      </div>

      <div style={s.composer}>
        <input
          style={{ ...s.input, flex: 1, fontSize: '0.9rem', padding: '0.55rem 0.75rem' }}
          placeholder={`Message in ${selCW.title}…`}
          value={newMessage}
          onChange={e => onNewMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendMessage(); } }}
          disabled={busy}
        />
        <button
          style={{ ...s.btn, padding: '0.55rem 1.1rem' }}
          onClick={onSendMessage}
          disabled={busy || !newMessage.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
