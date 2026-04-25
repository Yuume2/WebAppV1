'use client';

import type { ChatWindow as ChatWindowType } from '@webapp/types';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { CreateChatWindowCTA } from '@/features/workspace/CreateChatWindowCTA';
import type { MockMessage, WindowPreset } from '@/lib/data';
import { WINDOW_PRESETS } from '@/lib/data';

interface WorkspaceCanvasProps {
  workspaceId: string;
  totalWindows: number;
  visibleWindows: ChatWindowType[];
  getMessages: (chatWindowId: string) => MockMessage[];
  isPending: (chatWindowId: string) => boolean;
  onSend: (chatWindowId: string, content: string) => void;
  onRetry: (chatWindowId: string, clientTempId: string) => void;
  onCancel: (chatWindowId: string) => void;
  activeId: string | null;
  hasClosed: boolean;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onReset: () => void;
  onCreate: (preset: WindowPreset, title?: string) => string;
}

export function WorkspaceCanvas({
  workspaceId,
  totalWindows,
  visibleWindows,
  getMessages,
  isPending,
  onSend,
  onRetry,
  onCancel,
  activeId,
  hasClosed,
  onClose,
  onFocus,
  onRename,
  onReset,
  onCreate,
}: WorkspaceCanvasProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1rem',
        alignContent: 'start',
        overflowY: 'auto',
      }}
    >
      {visibleWindows.length === 0 ? (
        <EmptyWorkspace
          workspaceId={workspaceId}
          totalWindows={totalWindows}
          hasClosed={hasClosed}
          onReset={onReset}
          onCreate={onCreate}
        />
      ) : (
        visibleWindows.map((w) => (
          <ChatWindow
            key={w.id}
            id={w.id}
            title={w.title}
            provider={w.provider}
            model={w.model}
            messages={getMessages(w.id)}
            active={activeId === w.id}
            pending={isPending(w.id)}
            onClose={onClose}
            onFocus={onFocus}
            onSend={onSend}
            onRename={onRename}
            onRetry={onRetry}
            onCancel={onCancel}
          />
        ))
      )}
    </div>
  );
}

function EmptyWorkspace({
  workspaceId,
  totalWindows,
  hasClosed,
  onReset,
  onCreate,
}: {
  workspaceId: string;
  totalWindows: number;
  hasClosed: boolean;
  onReset: () => void;
  onCreate: (preset: WindowPreset, title?: string) => string;
}) {
  if (totalWindows === 0) {
    return (
      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 1rem',
          color: '#8a8a95',
        }}
      >
        <CreateChatWindowCTA workspaceId={workspaceId} />
      </div>
    );
  }
  const defaultPreset = WINDOW_PRESETS[0]!;
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
        {hasClosed
          ? 'Reopen a window from the sidebar or create a new one.'
          : 'Create your first window to begin.'}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => onCreate(defaultPreset)}
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
          + New window
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
