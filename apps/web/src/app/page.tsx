import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Panel } from '@/components/Panel';
import { listProjects, listWorkspacesForProject } from '@/lib/data';

export default function HomePage() {
  const projects = listProjects();

  return (
    <AppShell subtitle="Projects">
      <section style={{ padding: '1.5rem', maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 1.25rem 0' }}>Your projects</h1>
        {projects.length === 0 ? (
          <EmptyProjects />
        ) : (
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
        )}
      </section>
    </AppShell>
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
