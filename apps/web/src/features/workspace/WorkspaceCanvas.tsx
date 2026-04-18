'use client';

import type { ChatWindow as ChatWindowType } from '@webapp/types';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { WorkspaceToolbar } from '@/features/workspace/WorkspaceToolbar';
import { useWorkspaceState } from '@/features/workspace/useWorkspaceState';
import type { MockMessage } from '@/lib/data';

interface WorkspaceCanvasProps {
  projectName: string;
  workspaceName?: string;
  windows: ChatWindowType[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function WorkspaceCanvas({
  projectName,
  workspaceName,
  windows,
  messagesByWindow,
}: WorkspaceCanvasProps) {
  const state = useWorkspaceState({ windows });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <WorkspaceToolbar
        projectName={projectName}
        workspaceName={workspaceName}
        openCount={state.visibleWindows.length}
        totalCount={state.visibleWindows.length + state.closedWindows.length}
        closedWindows={state.closedWindows}
        onReset={state.reset}
        onAddMock={state.addMockWindow}
        onReopen={state.reopen}
      />
      <div
        style={{
          flex: 1,
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          alignContent: 'start',
        }}
      >
        {state.visibleWindows.length === 0 ? (
          <EmptyWorkspace
            hasClosed={state.closedWindows.length > 0}
            onReset={state.reset}
            onAddMock={state.addMockWindow}
          />
        ) : (
          state.visibleWindows.map((w) => (
            <ChatWindow
              key={w.id}
              id={w.id}
              title={w.title}
              provider={w.provider}
              model={w.model}
              messages={messagesByWindow[w.id] ?? []}
              active={state.activeId === w.id}
              onClose={state.close}
              onFocus={state.focus}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyWorkspace({
  hasClosed,
  onReset,
  onAddMock,
}: {
  hasClosed: boolean;
  onReset: () => void;
  onAddMock: () => void;
}) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1rem',
        gap: '0.75rem',
        color: '#8a8a95',
      }}
    >
      <div style={{ fontSize: '1rem', color: '#e8e8ef' }}>No windows open</div>
      <div style={{ fontSize: '0.85rem' }}>
        {hasClosed ? 'Reopen a closed window or reset the workspace.' : 'Add a mock window to begin.'}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={onAddMock}
          style={{
            background: '#f5f5f5',
            color: '#0b0b0d',
            border: 'none',
            borderRadius: 8,
            padding: '0.5rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + Mock window
        </button>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            color: '#f5f5f5',
            border: '1px solid #2a2a30',
            borderRadius: 8,
            padding: '0.5rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reset workspace
        </button>
      </div>
    </div>
  );
}
