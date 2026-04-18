import { notFound } from 'next/navigation';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';
import { AppShell } from '@/components/AppShell';
import {
  getProject,
  getWorkspaceByProject,
  getWindowsForWorkspace,
  getMessagesForWindow,
  type MockMessage,
} from '@/lib/mock-data';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const workspace = getWorkspaceByProject(project.id);
  if (!workspace) notFound();

  const windows = getWindowsForWorkspace(workspace.id);
  const messagesByWindow: Record<string, MockMessage[]> = {};
  for (const w of windows) messagesByWindow[w.id] = getMessagesForWindow(w.id);

  return (
    <AppShell subtitle={`${project.name} · ${workspace.name}`}>
      <WorkspaceCanvas windows={windows} messagesByWindow={messagesByWindow} />
    </AppShell>
  );
}
