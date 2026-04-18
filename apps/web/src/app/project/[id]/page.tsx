import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { WorkspaceCanvas } from '@/features/workspace/WorkspaceCanvas';
import { getProjectView } from '@/lib/data';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const view = getProjectView(id);
  if (!view) notFound();

  const { project, workspace, windows, messagesByWindow } = view;

  if (!workspace) {
    return (
      <AppShell subtitle="Project" right={<BackLink />}>
        <NoWorkspace projectName={project.name} />
      </AppShell>
    );
  }

  return (
    <AppShell subtitle="Workspace" right={<BackLink />}>
      <WorkspaceCanvas
        projectName={project.name}
        workspaceName={workspace.name}
        windows={windows}
        messagesByWindow={messagesByWindow}
      />
    </AppShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      style={{
        color: '#8a8a95',
        textDecoration: 'none',
        fontSize: '0.85rem',
      }}
    >
      ← Projects
    </Link>
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
