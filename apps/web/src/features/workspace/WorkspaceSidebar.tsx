'use client';

import Link from 'next/link';
import type { AIProvider, ChatWindow } from '@webapp/types';
import { Button } from '@/components/Button';

interface WorkspaceSidebarProps {
  projectName: string;
  workspaceName?: string;
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
  projectName,
  workspaceName,
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
        {workspaceName ? (
          <div style={{ fontSize: '0.78rem', color: '#8a8a95', marginTop: 2 }}>
            {workspaceName}
          </div>
        ) : null}
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
