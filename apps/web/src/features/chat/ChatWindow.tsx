'use client';

import { useState } from 'react';
import type { AIProvider } from '@webapp/types';
import type { MockMessage } from '@/lib/mock-data';

interface ChatWindowProps {
  id: string;
  title: string;
  provider: AIProvider;
  model: string;
  messages: MockMessage[];
  onClose?: (id: string) => void;
}

const providerColor: Record<AIProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  perplexity: '#6b8afd',
};

export function ChatWindow({ id, title, provider, model, messages, onClose }: ChatWindowProps) {
  const [draft, setDraft] = useState('');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        background: '#131318',
        border: '1px solid #24242c',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.9rem',
          borderBottom: '1px solid #24242c',
          background: '#181820',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#f5f5f5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              color: '#8a8a95',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: 2,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: providerColor[provider],
                display: 'inline-block',
              }}
            />
            {provider} · {model}
          </span>
        </div>
        {onClose ? (
          <button
            onClick={() => onClose(id)}
            aria-label="Close window"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a95',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0.25rem 0.4rem',
              borderRadius: 6,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem 0.9rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: '#6a6a75', fontSize: '0.85rem', margin: 'auto' }}>
            No messages yet
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDraft('');
        }}
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.65rem 0.75rem',
          borderTop: '1px solid #24242c',
          background: '#0f0f13',
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message…"
          style={{
            flex: 1,
            background: '#1b1b23',
            border: '1px solid #2a2a30',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            color: '#f5f5f5',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          style={{
            background: draft.trim() ? '#f5f5f5' : '#2a2a30',
            color: draft.trim() ? '#0b0b0d' : '#6a6a75',
            border: 'none',
            borderRadius: 8,
            padding: '0 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: MockMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? '#2b2b36' : '#1b1b23',
        border: '1px solid #24242c',
        borderRadius: 10,
        padding: '0.55rem 0.75rem',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        color: '#e8e8ef',
        whiteSpace: 'pre-wrap',
      }}
    >
      <div
        style={{
          fontSize: '0.65rem',
          color: '#8a8a95',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {message.role}
      </div>
      {message.content}
    </div>
  );
}
