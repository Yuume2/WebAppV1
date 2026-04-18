'use client';

import { useState } from 'react';
import type { ChatWindow } from '@webapp/types';
import { Button } from '@/components/Button';

interface WorkspaceToolbarProps {
  projectName: string;
  workspaceName?: string;
  openCount: number;
  totalCount: number;
  closedWindows: ChatWindow[];
  onReset: () => void;
  onAddMock: () => void;
  onReopen: (id: string) => void;
}

export function WorkspaceToolbar({
  projectName,
  workspaceName,
  openCount,
  totalCount,
  closedWindows,
  onReset,
  onAddMock,
  onReopen,
}: WorkspaceToolbarProps) {
  const [reopenOpen, setReopenOpen] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #24242c',
        background: '#0f0f13',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f5f5f5' }}>
          {projectName}
          {workspaceName ? (
            <span style={{ color: '#8a8a95', fontWeight: 400 }}> · {workspaceName}</span>
          ) : null}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#6a6a75', marginTop: 2 }}>
          {openCount} open · {totalCount} total
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
        {closedWindows.length > 0 ? (
          <div style={{ position: 'relative' }}>
            <Button variant="ghost" onClick={() => setReopenOpen((v) => !v)}>
              Reopen ({closedWindows.length})
            </Button>
            {reopenOpen ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#181820',
                  border: '1px solid #24242c',
                  borderRadius: 8,
                  minWidth: 200,
                  padding: 4,
                  zIndex: 10,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                }}
              >
                {closedWindows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      onReopen(w.id);
                      setReopenOpen(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: '#e8e8ef',
                      fontSize: '0.82rem',
                      padding: '0.45rem 0.6rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {w.title}
                    <span style={{ color: '#6a6a75', marginLeft: 6, fontSize: '0.7rem' }}>
                      {w.provider}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <Button variant="ghost" onClick={onAddMock}>
          + Mock window
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
