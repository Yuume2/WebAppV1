'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AIProvider, ChatWindow, Workspace } from '@webapp/types';
import { Button } from '@/components/Button';

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
  onAddMock: () => void;
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
  onAddMock,
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
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f5f5f5' }}>{projectName}</div>
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
        <Button variant="ghost" onClick={onAddMock} style={{ flex: 1, fontSize: '0.78rem' }}>
          + Mock
        </Button>
        <Button variant="ghost" onClick={onReset} style={{ flex: 1, fontSize: '0.78rem' }}>
          Reset
        </Button>
      </div>
    </aside>
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
  const [open, setOpen] = useState(false);
  const single = workspaces.length <= 1;

  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      <button
        onClick={() => !single && setOpen((v) => !v)}
        disabled={single}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 6,
          background: '#181820',
          border: '1px solid #24242c',
          borderRadius: 6,
          padding: '0.35rem 0.55rem',
          color: '#e8e8ef',
          fontSize: '0.78rem',
          fontFamily: 'inherit',
          cursor: single ? 'default' : 'pointer',
          opacity: single ? 0.85 : 1,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeWorkspaceName}
        </span>
        {single ? null : (
          <span style={{ color: '#8a8a95', fontSize: '0.7rem' }}>{open ? '▴' : '▾'}</span>
        )}
      </button>
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
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.55rem',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? '#1c1c28' : 'transparent',
        border: `1px solid ${active ? '#3a3f6b' : 'transparent'}`,
        opacity: muted ? 0.6 : 1,
        marginBottom: 2,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: providerColor[window.provider],
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.82rem',
            color: '#e8e8ef',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {window.title}
        </div>
        <div
          style={{
            fontSize: '0.68rem',
            color: '#8a8a95',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {window.provider} · {window.model}
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
