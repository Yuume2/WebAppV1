import type { ChatWindow, Project, Workspace } from '@webapp/types';
import {
  projects,
  workspaces,
  windows,
  messages,
  type MockMessage,
} from '@/lib/mocks/fixtures';

export type { MockMessage };

export interface ProjectView {
  project: Project;
  workspace: Workspace | null;
  windows: ChatWindow[];
  messagesByWindow: Record<string, MockMessage[]>;
}

export function listProjects(): Project[] {
  return projects;
}

export function getProject(id: string): Project | null {
  return projects.find((p) => p.id === id) ?? null;
}

export function getWorkspaceForProject(projectId: string): Workspace | null {
  return workspaces.find((w) => w.projectId === projectId) ?? null;
}

export function getWindowsForWorkspace(workspaceId: string): ChatWindow[] {
  return windows.filter((w) => w.workspaceId === workspaceId);
}

export function getMessagesForWindow(windowId: string): MockMessage[] {
  return messages.filter((m) => m.windowId === windowId);
}

export function getProjectView(projectId: string): ProjectView | null {
  const project = getProject(projectId);
  if (!project) return null;

  const workspace = getWorkspaceForProject(project.id);
  if (!workspace) {
    return { project, workspace: null, windows: [], messagesByWindow: {} };
  }

  const ws = getWindowsForWorkspace(workspace.id);
  const messagesByWindow: Record<string, MockMessage[]> = {};
  for (const w of ws) messagesByWindow[w.id] = getMessagesForWindow(w.id);

  return { project, workspace, windows: ws, messagesByWindow };
}
