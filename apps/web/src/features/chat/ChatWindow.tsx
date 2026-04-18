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
  active?: boolean;
  onClose?: (id: string) => void;
  onFocus?: (id: string) => void;
}

const providerColor: Record<AIProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  perplexity: '#6b8afd',
};

const providerLabel: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  perplexity: 'Perplexity',
};

export function ChatWindow({
  id,
  title,
  provider,
  model,
  messages,
  active = false,
  onClose,
  onFocus,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');

  return (
    <div
      onClick={() => onFocus?.(id)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        background: '#131318',
        border: `1px solid ${active ? '#4f6bff' : '#24242c'}`,
        boxShadow: active ? '0 0 0 1px rgba(79,107,255,0.35)' : 'none',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        cursor: active ? 'default' : 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.9rem',
          borderBottom: '1px solid #24242c',
          background: active ? '#1c1c28' : '#181820',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
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
          <ProviderBadge provider={provider} model={model} />
        </div>
        {onClose ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            aria-label="Close window"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a95',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              lineHeight: 1,
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
        onClick={(e) => e.stopPropagation()}
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
          onFocus={() => onFocus?.(id)}
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

function ProviderBadge({ provider, model }: { provider: AIProvider; model: string }) {
  const color = providerColor[provider];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: 4,
        padding: '2px 8px',
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        fontSize: '0.7rem',
        color: '#e8e8ef',
        alignSelf: 'flex-start',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      <span style={{ fontWeight: 600 }}>{providerLabel[provider]}</span>
      <span style={{ color: '#8a8a95' }}>· {model}</span>
    </span>
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
