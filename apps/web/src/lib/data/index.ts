import type { ChatWindow, Project, Workspace } from '@webapp/types';
import {
  projects,
  workspaces,
  windows,
  messages,
  type MockMessage,
  type MockMessageStatus,
} from '@/lib/mocks/fixtures';

export type { MockMessage, MockMessageStatus };
export { WINDOW_PRESETS, getPreset, type WindowPreset } from '@/lib/data/presets';

export type WorkspaceResolution =
  | { kind: 'ok'; workspace: Workspace }
  | { kind: 'invalid'; requestedId: string }
  | { kind: 'none' };

export interface ProjectView {
  project: Project;
  workspaces: Workspace[];
  resolution: WorkspaceResolution;
  windows: ChatWindow[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function listProjects(): Project[] {
  return projects;
}

export function getProject(id: string): Project | null {
  return projects.find((p) => p.id === id) ?? null;
}

export function listWorkspacesForProject(projectId: string): Workspace[] {
  return workspaces.filter((w) => w.projectId === projectId);
}

export function getWorkspace(id: string): Workspace | null {
  return workspaces.find((w) => w.id === id) ?? null;
}

export function getWindowsForWorkspace(workspaceId: string): ChatWindow[] {
  return windows.filter((w) => w.workspaceId === workspaceId);
}

export function getMessagesForWindow(chatWindowId: string): MockMessage[] {
  return messages.filter((m) => m.chatWindowId === chatWindowId);
}

export function getProjectView(
  projectId: string,
  workspaceId?: string,
): ProjectView | null {
  const project = getProject(projectId);
  if (!project) return null;

  const projectWorkspaces = listWorkspacesForProject(project.id);

  let resolution: WorkspaceResolution;
  if (projectWorkspaces.length === 0) {
    resolution = { kind: 'none' };
  } else if (workspaceId) {
    const requested = projectWorkspaces.find((w) => w.id === workspaceId);
    resolution = requested
      ? { kind: 'ok', workspace: requested }
      : { kind: 'invalid', requestedId: workspaceId };
  } else {
    resolution = { kind: 'ok', workspace: projectWorkspaces[0]! };
  }

  if (resolution.kind !== 'ok') {
    return {
      project,
      workspaces: projectWorkspaces,
      resolution,
      windows: [],
      messagesByWindow: {},
    };
  }

  const ws = getWindowsForWorkspace(resolution.workspace.id);
  const messagesByWindow: Record<string, MockMessage[]> = {};
  for (const w of ws) messagesByWindow[w.id] = getMessagesForWindow(w.id);

  return {
    project,
    workspaces: projectWorkspaces,
    resolution,
    windows: ws,
    messagesByWindow,
  };
}
