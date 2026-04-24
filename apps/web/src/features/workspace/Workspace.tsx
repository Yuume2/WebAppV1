'use client';

import type { ChatWindow, Workspace as WorkspaceType } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useWorkspaceState } from '@/features/workspace/useWorkspaceState';
import { useChatSessions } from '@/features/chat/useChatSessions';
import { WorkspaceSidebar } from '@/features/workspace/WorkspaceSidebar';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';

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
  const chat = useChatSessions(messagesByWindow);

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
