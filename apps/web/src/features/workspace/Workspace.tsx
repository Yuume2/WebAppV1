'use client';

import type { ChatWindow, Workspace as WorkspaceType } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useCallback } from 'react';
import { useWorkspaceState } from '@/features/workspace/useWorkspaceState';
import { useChatSessions } from '@/features/chat/useChatSessions';
import { WorkspaceSidebar } from '@/features/workspace/WorkspaceSidebar';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';
import { useToast } from '@/components/ToastHost';
import type { ApiCallError } from '@/lib/api/client';

interface WorkspaceProps {
  projectId: string;
  projectName: string;
  workspaces: WorkspaceType[];
  activeWorkspace: WorkspaceType;
  windows: ChatWindow[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function Workspace({
  projectId,
  projectName,
  workspaces,
  activeWorkspace,
  windows,
  messagesByWindow,
}: WorkspaceProps) {
  const state = useWorkspaceState({ windows });
  const toast = useToast();
  const handleSendError = useCallback(
    (chatWindowId: string, err: ApiCallError) => {
      const win = windows.find((w) => w.id === chatWindowId);
      const prefix = win?.title ?? 'Send failed';
      const code = err.code ?? 'error';
      if (code === 'provider_not_configured') {
        toast.push('error', `${prefix}: ${err.message}`, {
          action: { label: 'Add provider key →', href: '/settings/providers' },
        });
        return;
      }
      toast.push('error', `${prefix}: ${code} — ${err.message}`);
    },
    [toast, windows],
  );
  const chat = useChatSessions(messagesByWindow, { onError: handleSendError });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <WorkspaceSidebar
        projectId={projectId}
        projectName={projectName}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        visibleWindows={state.visibleWindows}
        closedWindows={state.closedWindows}
        activeId={state.activeId}
        onFocus={state.focus}
        onClose={state.close}
        onReopen={state.reopen}
        onCreate={state.createWindow}
        onReset={state.reset}
      />
      <WorkspaceCanvas
        workspaceId={activeWorkspace.id}
        totalWindows={state.visibleWindows.length + state.closedWindows.length}
        visibleWindows={state.visibleWindows}
        getMessages={chat.getMessages}
        isPending={chat.isPending}
        onSend={chat.sendUserMessage}
        onRetry={chat.retry}
        onCancel={chat.cancel}
        activeId={state.activeId}
        hasClosed={state.closedWindows.length > 0}
        onClose={state.close}
        onFocus={state.focus}
        onRename={state.renameWindow}
        onReset={state.reset}
        onCreate={state.createWindow}
      />
    </div>
  );
}
