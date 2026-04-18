import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Workspace } from '@/features/workspace/Workspace';
import { getProjectView } from '@/lib/data';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params;
  const { workspace: workspaceParam } = await searchParams;
  const view = getProjectView(id, workspaceParam);
  if (!view) notFound();

  const { project, workspaces, resolution, windows, messagesByWindow } = view;

  if (resolution.kind === 'none') {
    return (
      <AppShell subtitle="Project" right={<BackLink />}>
        <CenteredMessage
          title={project.name}
          subtitle="No workspace exists for this project yet."
        />
      </AppShell>
    );
  }

  if (resolution.kind === 'invalid') {
    const fallback = workspaces[0]!;
    return (
      <AppShell subtitle="Project" right={<BackLink />}>
        <CenteredMessage
          title="Workspace not found"
          subtitle={`The workspace "${resolution.requestedId}" does not belong to ${project.name}.`}
          action={
            <Link
              href={`/project/${project.id}?workspace=${fallback.id}`}
              style={{
                color: '#0b0b0d',
                background: '#f5f5f5',
                textDecoration: 'none',
                padding: '0.5rem 0.9rem',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              Open {fallback.name}
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <Workspace
      key={resolution.workspace.id}
      projectId={project.id}
      projectName={project.name}
      workspaces={workspaces}
      activeWorkspace={resolution.workspace}
      windows={windows}
      messagesByWindow={messagesByWindow}
    />
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      style={{ color: '#8a8a95', textDecoration: 'none', fontSize: '0.85rem' }}
    >
      ← Projects
    </Link>
  );
}

function CenteredMessage({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
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
        gap: '0.6rem',
      }}
    >
      <div style={{ fontSize: '1rem', color: '#e8e8ef' }}>{title}</div>
      <div style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 480 }}>{subtitle}</div>
      {action ? <div style={{ marginTop: '0.5rem' }}>{action}</div> : null}
    </div>
  );
}
