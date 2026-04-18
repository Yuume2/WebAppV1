'use client';

import { useState } from 'react';
import type { ChatWindow as ChatWindowType } from '@webapp/types';
import { ChatWindow } from '@/features/chat/ChatWindow';
import type { MockMessage } from '@/lib/mock-data';

interface WorkspaceCanvasProps {
  windows: ChatWindowType[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function WorkspaceCanvas({ windows, messagesByWindow }: WorkspaceCanvasProps) {
  const [openIds, setOpenIds] = useState<string[]>(windows.map((w) => w.id));
  const visible = windows.filter((w) => openIds.includes(w.id));

  return (
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
      {visible.length === 0 ? (
        <div
          style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            color: '#6a6a75',
            padding: '3rem 0',
          }}
        >
          No open windows
        </div>
      ) : (
        visible.map((w) => (
          <ChatWindow
            key={w.id}
            id={w.id}
            title={w.title}
            provider={w.provider}
            model={w.model}
            messages={messagesByWindow[w.id] ?? []}
            onClose={(id) => setOpenIds((prev) => prev.filter((x) => x !== id))}
          />
        ))
      )}
    </div>
  );
}
