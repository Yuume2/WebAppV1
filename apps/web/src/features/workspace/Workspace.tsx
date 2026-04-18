'use client';

import type { ChatWindow } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useWorkspaceState } from '@/features/workspace/useWorkspaceState';
import { WorkspaceSidebar } from '@/features/workspace/WorkspaceSidebar';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';

interface WorkspaceProps {
  projectName: string;
  workspaceName?: string;
  windows: ChatWindow[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function Workspace({
  projectName,
  workspaceName,
  windows,
  messagesByWindow,
}: WorkspaceProps) {
  const state = useWorkspaceState({ windows });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <WorkspaceSidebar
        projectName={projectName}
        workspaceName={workspaceName}
        visibleWindows={state.visibleWindows}
        closedWindows={state.closedWindows}
        activeId={state.activeId}
        onFocus={state.focus}
        onClose={state.close}
        onReopen={state.reopen}
        onAddMock={state.addMockWindow}
        onReset={state.reset}
      />
      <WorkspaceCanvas
        visibleWindows={state.visibleWindows}
        messagesByWindow={messagesByWindow}
        activeId={state.activeId}
        hasClosed={state.closedWindows.length > 0}
        onClose={state.close}
        onFocus={state.focus}
        onReset={state.reset}
        onAddMock={state.addMockWindow}
      />
    </div>
  );
}
