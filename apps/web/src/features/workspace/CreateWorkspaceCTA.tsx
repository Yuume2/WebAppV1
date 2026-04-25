'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { useToast } from '@/components/ToastHost';
import { createWorkspace } from '@/lib/api/workspaces';

interface CreateWorkspaceCTAProps {
  projectId: string;
}

export function CreateWorkspaceCTA({ projectId }: CreateWorkspaceCTAProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div style={{ padding: '3rem 1.5rem', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <Panel style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ color: '#e8e8ef', fontSize: '1.1rem', fontWeight: 500 }}>
            No workspace yet
          </div>
          <div
            style={{
              color: '#8a8a95',
              fontSize: '0.9rem',
              marginTop: 6,
              marginBottom: '1.25rem',
            }}
          >
            A workspace groups chat windows for this project.
          </div>
          <Button onClick={() => setOpen(true)}>Create workspace</Button>
        </Panel>
      </div>
      {open && (
        <CreateWorkspaceModal projectId={projectId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CreateWorkspaceModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      try {
        await createWorkspace({ projectId, name: trimmed });
        onClose();
        router.refresh();
      } catch (err) {
        toast.pushError(err, 'create workspace');
      } finally {
        setSubmitting(false);
      }
    },
    [name, submitting, projectId, onClose, router, toast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
      style={backdropStyle}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 id="create-workspace-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          New workspace
        </h2>
        <form
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: '#8a8a95' }}>Workspace name</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              disabled={submitting}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
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
