'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type KeyboardEvent } from 'react';
import type { AIProvider, ChatWindow, Workspace } from '@webapp/types';
import type { WindowPreset } from '@/lib/data';
import { Button } from '@/components/Button';
import { NewWindowComposer } from '@/features/workspace/NewWindowComposer';
import { useToast } from '@/components/ToastHost';
import type { ApiCallError } from '@/lib/api/client';
import { deleteProject, patchProject } from '@/lib/api/projects';
import { deleteWorkspace, patchWorkspace } from '@/lib/api/workspaces';

interface WorkspaceSidebarProps {
  projectId: string;
  projectName: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  visibleWindows: ChatWindow[];
  closedWindows: ChatWindow[];
  activeId: string | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onReopen: (id: string) => void;
  onCreate: (preset: WindowPreset, title?: string) => string;
  onReset: () => void;
}

const providerColor: Record<AIProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  perplexity: '#6b8afd',
};

export function WorkspaceSidebar({
  projectId,
  projectName,
  workspaces,
  activeWorkspaceId,
  visibleWindows,
  closedWindows,
  activeId,
  onFocus,
  onClose,
  onReopen,
  onCreate,
  onReset,
}: WorkspaceSidebarProps) {
  const total = visibleWindows.length + closedWindows.length;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #24242c',
        background: '#0f0f13',
      }}
    >
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #24242c' }}>
        <Link
          href="/"
          style={{
            color: '#8a8a95',
            textDecoration: 'none',
            fontSize: '0.78rem',
            display: 'inline-block',
            marginBottom: 8,
          }}
        >
          ← Projects
        </Link>
        <ProjectHeader projectId={projectId} projectName={projectName} />
        <WorkspaceSwitcher
          projectId={projectId}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspaceName={activeWorkspace?.name ?? '—'}
        />
        <div style={{ fontSize: '0.7rem', color: '#6a6a75', marginTop: 8 }}>
          {visibleWindows.length} open · {total} total
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <SectionLabel>Open</SectionLabel>
        {visibleWindows.length === 0 ? (
          <EmptyHint>No windows open</EmptyHint>
        ) : (
          visibleWindows.map((w) => (
            <WindowRow
              key={w.id}
              window={w}
              active={activeId === w.id}
              onClick={() => onFocus(w.id)}
              onAction={() => onClose(w.id)}
              actionLabel="×"
              actionAria="Close window"
            />
          ))
        )}

        {closedWindows.length > 0 ? (
          <>
            <SectionLabel>Closed</SectionLabel>
            {closedWindows.map((w) => (
              <WindowRow
                key={w.id}
                window={w}
                active={false}
                muted
                onClick={() => onReopen(w.id)}
                onAction={() => onReopen(w.id)}
                actionLabel="↺"
                actionAria="Reopen window"
              />
            ))}
          </>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          padding: '0.65rem 0.75rem',
          borderTop: '1px solid #24242c',
          background: '#0c0c10',
        }}
      >
        <NewWindowComposer onCreate={onCreate} />
        <Button variant="ghost" onClick={onReset} style={{ flex: 1, fontSize: '0.78rem' }}>
          Reset
        </Button>
      </div>
    </aside>
  );
}

function ProjectHeader({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const [name, setName] = useState(projectName);
  const [busy, setBusy] = useState(false);
  const isLocal = projectId.startsWith('local-') || projectId.startsWith('proj-');

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    if (isLocal) {
      setName(trimmed);
      return;
    }
    const previous = name;
    setName(trimmed);
    setBusy(true);
    void patchProject(projectId, { name: trimmed })
      .then((p) => {
        setName(p.name);
        setDraft(p.name);
        router.refresh();
      })
      .catch((err: unknown) => {
        const e = err as ApiCallError;
        setName(previous);
        setDraft(previous);
        toast.push('error', `Rename project failed: ${e.code ?? 'error'} — ${e.message}`);
      })
      .finally(() => setBusy(false));
  }, [draft, name, projectId, isLocal, router, toast]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(name);
      setEditing(false);
    }
  };

  const onDelete = () => {
    if (busy) return;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(
      `Delete project "${name}"? This removes all its workspaces, chat windows, and messages. This cannot be undone.`,
    );
    if (!ok) return;
    if (isLocal) {
      router.replace('/');
      return;
    }
    setBusy(true);
    void deleteProject(projectId)
      .then(() => {
        router.replace('/');
        router.refresh();
      })
      .catch((err: unknown) => {
        const e = err as ApiCallError;
        toast.push('error', `Delete project failed: ${e.code ?? 'error'} — ${e.message}`);
        setBusy(false);
      });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label="Rename project"
          style={{
            flex: 1,
            background: '#0f0f13',
            border: '1px solid #2a2a30',
            borderRadius: 4,
            padding: '2px 6px',
            color: '#f5f5f5',
            fontSize: '0.95rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      ) : (
        <button
          onDoubleClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          title="Double-click to rename"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#f5f5f5',
            fontSize: '0.95rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            textAlign: 'left',
            padding: 0,
            cursor: 'text',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete project"
        title="Delete project"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#8a8a95',
          cursor: busy ? 'not-allowed' : 'pointer',
          fontSize: '0.65rem',
          fontWeight: 500,
          padding: '2px 6px',
          borderRadius: 4,
          fontFamily: 'inherit',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          opacity: busy ? 0.5 : 1,
        }}
      >
        Delete
      </button>
    </div>
  );
}

function WorkspaceSwitcher({
  projectId,
  workspaces,
  activeWorkspaceId,
  activeWorkspaceName,
}: {
  projectId: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeWorkspaceName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activeWorkspaceName);
  const [name, setName] = useState(activeWorkspaceName);
  const [busy, setBusy] = useState(false);
  const isLocal =
    activeWorkspaceId.startsWith('local-') || activeWorkspaceId.startsWith('ws-');
  const single = workspaces.length <= 1;

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    if (isLocal) {
      setName(trimmed);
      return;
    }
    const previous = name;
    setName(trimmed);
    setBusy(true);
    void patchWorkspace(activeWorkspaceId, { name: trimmed })
      .then((w) => {
        setName(w.name);
        setDraft(w.name);
        router.refresh();
      })
      .catch((err: unknown) => {
        const e = err as ApiCallError;
        setName(previous);
        setDraft(previous);
        toast.push('error', `Rename workspace failed: ${e.code ?? 'error'} — ${e.message}`);
      })
      .finally(() => setBusy(false));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(name);
      setEditing(false);
    }
  };

  const onDelete = () => {
    if (busy) return;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(
      `Delete workspace "${name}"? This removes all its chat windows and messages. This cannot be undone.`,
    );
    if (!ok) return;
    if (isLocal) {
      const next = workspaces.find((w) => w.id !== activeWorkspaceId);
      router.replace(next ? `/project/${projectId}?workspace=${next.id}` : `/project/${projectId}`);
      return;
    }
    setBusy(true);
    void deleteWorkspace(activeWorkspaceId)
      .then(() => {
        const next = workspaces.find((w) => w.id !== activeWorkspaceId);
        router.replace(next ? `/project/${projectId}?workspace=${next.id}` : `/project/${projectId}`);
        router.refresh();
      })
      .catch((err: unknown) => {
        const e = err as ApiCallError;
        toast.push('error', `Delete workspace failed: ${e.code ?? 'error'} — ${e.message}`);
        setBusy(false);
      });
  };

  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename workspace"
            style={{
              flex: 1,
              background: '#0f0f13',
              border: '1px solid #2a2a30',
              borderRadius: 6,
              padding: '0.35rem 0.55rem',
              color: '#f5f5f5',
              fontSize: '0.78rem',
              fontFamily: 'inherit',
              outline: 'none',
              minWidth: 0,
            }}
          />
        ) : (
          <button
            onClick={() => !single && setOpen((v) => !v)}
            onDoubleClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            title={single ? 'Double-click to rename' : 'Switch · double-click to rename'}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              background: '#181820',
              border: '1px solid #24242c',
              borderRadius: 6,
              padding: '0.35rem 0.55rem',
              color: '#e8e8ef',
              fontSize: '0.78rem',
              fontFamily: 'inherit',
              cursor: single ? 'text' : 'pointer',
              minWidth: 0,
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
            {single ? null : (
              <span style={{ color: '#8a8a95', fontSize: '0.7rem' }}>{open ? '▴' : '▾'}</span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete workspace"
          title="Delete workspace"
          style={{
            background: 'transparent',
            border: '1px solid #24242c',
            color: '#8a8a95',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '0.65rem',
            fontWeight: 500,
            padding: '0 0.5rem',
            borderRadius: 6,
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            opacity: busy ? 0.5 : 1,
          }}
        >
          Delete
        </button>
      </div>
      {open && !single ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#181820',
            border: '1px solid #24242c',
            borderRadius: 6,
            padding: 4,
            zIndex: 10,
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          }}
        >
          {workspaces.map((w) => {
            const active = w.id === activeWorkspaceId;
            return (
              <Link
                key={w.id}
                href={`/project/${projectId}?workspace=${w.id}`}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0.55rem',
                  borderRadius: 4,
                  color: active ? '#f5f5f5' : '#cfcfd6',
                  background: active ? '#1c1c28' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '0.78rem',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.name}
                </span>
                {active ? <span style={{ color: '#8a8a95', fontSize: '0.7rem' }}>●</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#6a6a75',
        padding: '0.5rem 0.5rem 0.25rem',
      }}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#6a6a75', fontSize: '0.78rem', padding: '0.5rem 0.5rem' }}>
      {children}
    </div>
  );
}

interface WindowRowProps {
  window: ChatWindow;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
  onAction: () => void;
  actionLabel: string;
  actionAria: string;
}

function WindowRow({ window, active, muted, onClick, onAction, actionLabel, actionAria }: WindowRowProps) {
  const stamp = formatRelative(window.updatedAt ?? window.createdAt);
  return (
    <div
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.55rem',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? '#1c1c28' : 'transparent',
        border: `1px solid ${active ? '#4f6bff' : 'transparent'}`,
        boxShadow: active ? '0 0 0 1px rgba(79,107,255,0.25)' : 'none',
        opacity: muted ? 0.55 : 1,
        marginBottom: 2,
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: providerColor[window.provider],
          flexShrink: 0,
          boxShadow: active ? '0 0 0 2px rgba(79,107,255,0.18)' : 'none',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.82rem',
            color: active ? '#f5f5f5' : '#e8e8ef',
            fontWeight: active ? 600 : 500,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {window.title}
          </span>
          {active ? (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.62rem',
                fontWeight: 600,
                color: '#9aa6ff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              Active
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.68rem',
            color: '#8a8a95',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {window.provider} · {window.model}
          </span>
          {stamp ? (
            <span
              style={{
                marginLeft: 'auto',
                color: '#6a6a75',
                flexShrink: 0,
              }}
              title={window.updatedAt ?? window.createdAt}
            >
              {stamp}
            </span>
          ) : null}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        aria-label={actionAria}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#8a8a95',
          cursor: 'pointer',
          fontSize: '0.95rem',
          padding: '2px 6px',
          borderRadius: 4,
          lineHeight: 1,
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  const yr = Math.floor(day / 365);
  return `${yr}y`;
}
