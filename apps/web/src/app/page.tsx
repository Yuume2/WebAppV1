import { fetchState } from '@/lib/api';
import type { Project, Workspace, ChatWindow } from '@webapp/types';

export default async function HomePage() {
  let state: Awaited<ReturnType<typeof fetchState>> | null = null;
  let error: string | null = null;

  try {
    state = await fetchState();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load data';
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>AI Workspace V1</h1>

      {error && (
        <p style={styles.error}>
          ⚠ Could not reach API — {error}. Is the backend running on port 4000?
        </p>
      )}

      {state && state.projects.length === 0 && (
        <p style={styles.muted}>
          No projects yet. Call <code>POST /v1/dev/seed</code> to populate demo data.
        </p>
      )}

      {state && state.projects.length > 0 && (
        <div style={styles.list}>
          {state.projects.map((project: Project) => {
            const workspaces = state!.workspaces.filter(
              (ws: Workspace) => ws.projectId === project.id,
            );
            return (
              <section key={project.id} style={styles.card}>
                <h2 style={styles.projectTitle}>{project.name}</h2>
                {project.description && (
                  <p style={styles.description}>{project.description}</p>
                )}
                {workspaces.length === 0 ? (
                  <p style={styles.muted}>No workspaces</p>
                ) : (
                  workspaces.map((ws: Workspace) => {
                    const windows = state!.chatWindows.filter(
                      (cw: ChatWindow) => cw.workspaceId === ws.id,
                    );
                    return (
                      <div key={ws.id} style={styles.workspace}>
                        <p style={styles.wsName}>{ws.name}</p>
                        {windows.length === 0 ? (
                          <p style={styles.muted}>No chat windows</p>
                        ) : (
                          <ul style={styles.windowList}>
                            {windows.map((cw: ChatWindow) => {
                              const msgCount = state!.messages.filter(
                                (m) => m.chatWindowId === cw.id,
                              ).length;
                              return (
                                <li key={cw.id} style={styles.windowItem}>
                                  <span>{cw.title}</span>
                                  <span style={styles.badge}>
                                    {cw.provider} · {cw.model}
                                  </span>
                                  <span style={styles.muted}>{msgCount} msg</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    padding: '2rem',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'system-ui, sans-serif',
  },
  heading: {
    fontSize: '2rem',
    margin: '0 0 1.5rem',
    color: '#f5f5f5',
  },
  error: {
    color: '#f87171',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  card: {
    border: '1px solid #222',
    borderRadius: '8px',
    padding: '1rem 1.25rem',
    background: '#111113',
  },
  projectTitle: {
    fontSize: '1.1rem',
    margin: '0 0 0.25rem',
    color: '#e5e5e5',
  },
  description: {
    fontSize: '0.85rem',
    color: '#888',
    margin: '0 0 0.75rem',
  },
  workspace: {
    marginTop: '0.75rem',
    paddingLeft: '0.75rem',
    borderLeft: '2px solid #222',
  },
  wsName: {
    fontSize: '0.9rem',
    color: '#aaa',
    margin: '0 0 0.35rem',
    fontWeight: 500,
  },
  windowList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  windowItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: '#ccc',
  },
  badge: {
    fontSize: '0.75rem',
    color: '#666',
    background: '#1a1a1e',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
  },
  muted: {
    fontSize: '0.8rem',
    color: '#555',
    margin: '0.25rem 0',
  },
} as const;
