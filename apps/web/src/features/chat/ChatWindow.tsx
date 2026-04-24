'use client';

import { useState } from 'react';
import type { AIProvider } from '@webapp/types';
import type { MockMessage } from '@/lib/data';

interface ChatWindowProps {
  id: string;
  title: string;
  provider: AIProvider;
  model: string;
  messages: MockMessage[];
  active?: boolean;
  onClose?: (id: string) => void;
  onFocus?: (id: string) => void;
  onSend?: (id: string, content: string) => void;
  onRename?: (id: string, title: string) => void;
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
  onSend,
  onRename,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const commitRename = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) onRename?.(id, trimmed);
    else setTitleDraft(title);
    setEditing(false);
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend?.(id, trimmed);
    setDraft('');
  };

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
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setTitleDraft(title);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Rename window"
              style={{
                background: '#0f0f13',
                border: '1px solid #2a2a30',
                borderRadius: 4,
                padding: '2px 6px',
                color: '#f5f5f5',
                fontSize: '0.9rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!onRename) return;
                setTitleDraft(title);
                setEditing(true);
              }}
              title={onRename ? 'Double-click to rename' : title}
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#f5f5f5',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: onRename ? 'text' : 'inherit',
              }}
            >
              {title}
            </span>
          )}
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
          <div
            style={{
              color: '#6a6a75',
              fontSize: '0.85rem',
              margin: 'auto',
              textAlign: 'center',
            }}
          >
            No messages yet.
            <br />
            <span style={{ fontSize: '0.75rem' }}>Type below to start the conversation.</span>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
          aria-label={`Message ${title}`}
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

function formatMessageTimestamp(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function MessageBubble({ message }: { message: MockMessage }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const timestamp = formatMessageTimestamp(message.createdAt);
  const metaParts: string[] = [];
  if (message.provider) metaParts.push(providerLabel[message.provider]);
  if (message.model) metaParts.push(message.model);
  if (timestamp) metaParts.push(timestamp);
  const showMeta = isAssistant && metaParts.length > 0;
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
      {showMeta && (
        <div
          data-testid="message-meta"
          style={{
            marginTop: 6,
            fontSize: '0.65rem',
            color: '#6a6a75',
            letterSpacing: '0.02em',
          }}
        >
          {metaParts.join(' · ')}
        </div>
      )}
    </div>
  );
}
