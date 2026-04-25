'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AIProvider } from '@webapp/types';
import type { MockMessage } from '@/lib/data';

interface ChatWindowProps {
  id: string;
  title: string;
  provider: AIProvider;
  model: string;
  messages: MockMessage[];
  active?: boolean;
  pending?: boolean;
  onClose?: (id: string) => void;
  onFocus?: (id: string) => void;
  onSend?: (id: string, content: string) => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string, clientTempId: string) => void;
  onCancel?: (id: string) => void;
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
  pending = false,
  onClose,
  onFocus,
  onSend,
  onRename,
  onDelete,
  onRetry,
  onCancel,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesSignature = messages
    .map((m) => `${m.id}:${m.content.length}:${m.status ?? 'ok'}`)
    .join('|');

  const updateStickiness = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickyRef.current = distanceFromBottom < 64;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickyRef.current) el.scrollTop = el.scrollHeight;
  }, [messagesSignature]);

  const commitRename = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) onRename?.(id, trimmed);
    else setTitleDraft(title);
    setEditing(false);
  };

  const submit = () => {
    if (pending) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    stickyRef.current = true;
    onSend?.(id, trimmed);
    setDraft('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !pending && draft.trim().length > 0;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {onDelete ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (typeof window === 'undefined') {
                  onDelete(id);
                  return;
                }
                const ok = window.confirm(
                  `Delete chat window "${title}"? This removes its messages and cannot be undone.`,
                );
                if (ok) onDelete(id);
              }}
              aria-label="Delete chat window"
              title="Delete chat window"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8a8a95',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: 500,
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                lineHeight: 1,
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Delete
            </button>
          ) : null}
          {onClose ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              aria-label="Close window"
              title="Close window"
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
      </div>

      <div
        ref={scrollRef}
        onScroll={updateStickiness}
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
              margin: 'auto',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              color: '#8a8a95',
            }}
          >
            <div style={{ fontSize: '0.95rem', color: '#e8e8ef' }}>Start the conversation</div>
            <div style={{ fontSize: '0.78rem' }}>
              Type below — Enter to send, Shift+Enter for a newline.
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onRetry={
                onRetry && m.clientTempId ? () => onRetry(id, m.clientTempId!) : undefined
              }
            />
          ))
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
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKeyDown}
          onFocus={() => onFocus?.(id)}
          placeholder={pending ? 'Waiting for reply…' : 'Send a message…  (Shift+Enter for newline)'}
          aria-label={`Message ${title}`}
          disabled={pending}
          style={{
            flex: 1,
            background: '#1b1b23',
            border: '1px solid #2a2a30',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            color: pending ? '#8a8a95' : '#f5f5f5',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'none',
            minHeight: 36,
            maxHeight: 160,
            lineHeight: 1.4,
          }}
        />
        {pending && onCancel ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(id);
            }}
            aria-label="Stop generating"
            style={{
              background: '#2a2a30',
              color: '#f5f5f5',
              border: '1px solid #3a3a45',
              borderRadius: 8,
              padding: '0 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              alignSelf: 'stretch',
            }}
          >
            Stop generating
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            style={{
              background: canSend ? '#f5f5f5' : '#2a2a30',
              color: canSend ? '#0b0b0d' : '#6a6a75',
              border: 'none',
              borderRadius: 8,
              padding: '0 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: canSend ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              alignSelf: 'stretch',
            }}
          >
            Send
          </button>
        )}
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

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '2px solid rgba(245,245,245,0.18)',
        borderTopColor: '#f5f5f5',
        animation: 'chat-spin 0.7s linear infinite',
        marginLeft: 6,
        verticalAlign: '-1px',
      }}
    />
  );
}

function StreamingCursor() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 7,
        height: '0.95em',
        marginLeft: 2,
        background: '#f5f5f5',
        verticalAlign: '-2px',
        animation: 'chat-blink 1s steps(2, end) infinite',
      }}
    />
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: MockMessage;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const timestamp = formatMessageTimestamp(message.createdAt);
  const metaParts: string[] = [];
  if (message.provider) metaParts.push(providerLabel[message.provider]);
  if (message.model) metaParts.push(message.model);
  if (timestamp) metaParts.push(timestamp);
  const showMeta = isAssistant && metaParts.length > 0;
  const status = message.status ?? 'ok';
  const isPending = status === 'pending';
  const isStreaming = status === 'streaming';
  const isFailed = status === 'failed';
  const isCanceled = isFailed && message.errorCode === 'canceled';
  const borderColor = isFailed ? (isCanceled ? '#3a3a45' : '#6b2a2a') : '#24242c';
  const opacity = isPending ? 0.7 : 1;

  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? '#2b2b36' : '#1b1b23',
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: '0.55rem 0.75rem',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        color: '#e8e8ef',
        whiteSpace: 'pre-wrap',
        opacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.65rem',
          color: '#8a8a95',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        <span>{message.role}</span>
        {isPending && <Spinner />}
        {isFailed && (
          <span
            style={{
              color: isCanceled ? '#a0a0aa' : '#ff8b8b',
              marginLeft: 6,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {isCanceled ? 'canceled' : 'failed'}
          </span>
        )}
      </div>
      {message.content}
      {isStreaming && <StreamingCursor />}
      {isFailed && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: '0.7rem',
          }}
        >
          {message.errorMessage && (
            <span style={{ color: isCanceled ? '#a0a0aa' : '#ffd3d3' }}>
              {message.errorCode ?? 'error'} — {message.errorMessage}
            </span>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              style={{
                background: 'transparent',
                color: isCanceled ? '#e8e8ef' : '#ffd3d3',
                border: `1px solid ${isCanceled ? '#3a3a45' : '#6b2a2a'}`,
                borderRadius: 6,
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.7rem',
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
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
