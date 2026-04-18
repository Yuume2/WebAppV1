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
  if (!workspace) {
    return (
      <AppShell subtitle={project.name}>
        <NoWorkspace projectName={project.name} />
      </AppShell>
    );
  }

  const windows = getWindowsForWorkspace(workspace.id);
  const messagesByWindow: Record<string, MockMessage[]> = {};
  for (const w of windows) messagesByWindow[w.id] = getMessagesForWindow(w.id);

  return (
    <AppShell subtitle="Workspace">
      <WorkspaceCanvas
        projectName={project.name}
        workspaceName={workspace.name}
        windows={windows}
        messagesByWindow={messagesByWindow}
      />
    </AppShell>
  );
}

function NoWorkspace({ projectName }: { projectName: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem',
        color: '#8a8a95',
        gap: '0.5rem',
      }}
    >
      <div style={{ fontSize: '1rem', color: '#e8e8ef' }}>{projectName}</div>
      <div style={{ fontSize: '0.85rem' }}>No workspace exists for this project yet.</div>
    </div>
  );
}
