import Link from 'next/link';
import type { Project } from '@webapp/types';
import { AppShell } from '@/components/AppShell';
import { Panel } from '@/components/Panel';
import { listProjects as listMockProjects, listWorkspacesForProject } from '@/lib/data';
import { getApiBaseUrl } from '@/lib/api/env';
import { fetchProjects } from '@/lib/api/projects';

type ProjectsResult =
  | { source: 'api'; projects: Project[] }
  | { source: 'mock'; projects: Project[] }
  | { source: 'error'; message: string };

async function loadProjects(): Promise<ProjectsResult> {
  if (!getApiBaseUrl()) {
    return { source: 'mock', projects: listMockProjects() };
  }
  try {
    const projects = await fetchProjects();
    return { source: 'api', projects };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { source: 'error', message };
  }
}

export default async function HomePage() {
  const result = await loadProjects();

  return (
    <AppShell subtitle="Projects" right={<SourceBadge result={result} />}>
      <section style={{ padding: '1.5rem', maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 1.25rem 0' }}>Your projects</h1>
        {result.source === 'error' ? (
          <ErrorPanel message={result.message} />
        ) : result.projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <ProjectGrid projects={result.projects} />
        )}
      </section>
    </AppShell>
  );
}

function ProjectGrid({ projects }: { projects: Project[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}
    >
      {projects.map((project) => {
        const projectWorkspaces = listWorkspacesForProject(project.id);
        const totalWindows = projectWorkspaces.reduce((sum, w) => sum + w.windowIds.length, 0);
        return (
          <Link
            key={project.id}
            href={`/project/${project.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Panel style={{ padding: '1rem', height: '100%' }}>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>{project.name}</div>
              {project.description ? (
                <div style={{ color: '#8a8a95', fontSize: '0.85rem', marginTop: 4 }}>
                  {project.description}
                </div>
              ) : null}
              <div style={{ color: '#6a6a75', fontSize: '0.75rem', marginTop: 12 }}>
                {projectWorkspaces.length === 0
                  ? 'No workspace'
                  : `${projectWorkspaces.length} workspace${projectWorkspaces.length > 1 ? 's' : ''} · ${totalWindows} windows`}
              </div>
            </Panel>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyProjects() {
  return (
    <Panel style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ color: '#e8e8ef', fontSize: '1rem' }}>No projects yet</div>
      <div style={{ color: '#8a8a95', fontSize: '0.85rem', marginTop: 6 }}>
        Create your first project to get started.
      </div>
    </Panel>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Panel style={{ padding: '1.25rem', borderColor: '#6b2a2a' }}>
      <div style={{ color: '#ffb4b4', fontSize: '0.9rem', fontWeight: 600 }}>
        Could not reach the API
      </div>
      <div style={{ color: '#d8a0a0', fontSize: '0.82rem', marginTop: 4, whiteSpace: 'pre-wrap' }}>
        {message}
      </div>
      <div style={{ color: '#8a8a95', fontSize: '0.78rem', marginTop: 10 }}>
        Check that <code>apps/api</code> is running and <code>NEXT_PUBLIC_API_URL</code> points to it.
      </div>
    </Panel>
  );
}

function SourceBadge({ result }: { result: ProjectsResult }) {
  const config =
    result.source === 'api'
      ? { label: 'api', color: '#10a37f' }
      : result.source === 'mock'
        ? { label: 'mock data', color: '#8a8a95' }
        : { label: 'api error', color: '#d97757' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        fontSize: '0.7rem',
        color: '#e8e8ef',
        background: `${config.color}1a`,
        border: `1px solid ${config.color}55`,
        borderRadius: 999,
      }}
      title={
        result.source === 'mock'
          ? 'Set NEXT_PUBLIC_API_URL in apps/web to fetch from the real API'
          : result.source === 'error'
            ? result.message
            : 'Fetched from the API'
      }
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: config.color,
          display: 'inline-block',
        }}
      />
      {config.label}
    </span>
  );
}
