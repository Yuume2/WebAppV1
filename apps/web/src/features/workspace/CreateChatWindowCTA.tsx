'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AIProvider } from '@webapp/types';
import { Button } from '@/components/Button';
import { useToast } from '@/components/ToastHost';
import { createChatWindow } from '@/lib/api/chat-windows';

const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string; defaultModel: string }> = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { value: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4-6' },
  { value: 'perplexity', label: 'Perplexity', defaultModel: 'sonar-pro' },
];

interface CreateChatWindowCTAProps {
  workspaceId: string;
}

export function CreateChatWindowCTA({ workspaceId }: CreateChatWindowCTAProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ fontSize: '1rem', color: '#e8e8ef' }}>No windows yet</div>
        <div style={{ fontSize: '0.85rem', color: '#8a8a95' }}>
          Add a chat window to start a conversation.
        </div>
        <Button onClick={() => setOpen(true)} style={{ marginTop: '0.5rem' }}>
          Create chat window
        </Button>
      </div>
      {open && (
        <CreateChatWindowModal workspaceId={workspaceId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CreateChatWindowModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [submitting, setSubmitting] = useState(false);

  const onProviderChange = (value: AIProvider) => {
    setProvider(value);
    const def = PROVIDER_OPTIONS.find((o) => o.value === value)?.defaultModel;
    if (def) setModel(def);
  };

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedTitle = title.trim();
      const trimmedModel = model.trim();
      if (!trimmedTitle || !trimmedModel || submitting) return;
      setSubmitting(true);
      try {
        await createChatWindow({
          workspaceId,
          title: trimmedTitle,
          provider,
          model: trimmedModel,
        });
        onClose();
        router.refresh();
      } catch (err) {
        toast.pushError(err, 'create chat window');
      } finally {
        setSubmitting(false);
      }
    },
    [title, model, provider, submitting, workspaceId, onClose, router, toast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-chat-window-title"
      style={backdropStyle}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 id="create-chat-window-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          New chat window
        </h2>
        <form
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
        >
          <label style={fieldStyle}>
            <span style={labelTextStyle}>Title</span>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              disabled={submitting}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelTextStyle}>Provider</span>
            <select
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as AIProvider)}
              disabled={submitting}
              style={inputStyle}
            >
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelTextStyle}>Model</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              maxLength={80}
              disabled={submitting}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !title.trim() || !model.trim()}
            >
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: '#141418',
  border: '1px solid #2a2a30',
  borderRadius: 12,
  padding: '1.5rem',
  width: '100%',
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  color: '#f5f5f5',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#8a8a95',
};

const inputStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  borderRadius: 6,
  border: '1px solid #2a2a30',
  background: '#0f0f13',
  color: '#f5f5f5',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
};
