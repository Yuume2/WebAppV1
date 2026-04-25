import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Project, Workspace as WorkspaceType } from '@webapp/types';
import { AppShell } from '@/components/AppShell';
import { Panel } from '@/components/Panel';
import { Workspace } from '@/features/workspace/Workspace';
import { CreateWorkspaceCTA } from '@/features/workspace/CreateWorkspaceCTA';
import {
  getProject as getMockProject,
  listWorkspacesForProject,
  getWindowsForWorkspace,
  getMessagesForWindow,
  type MockMessage,
} from '@/lib/data';
import { getApiBaseUrl } from '@/lib/api/env';
import { fetchProject } from '@/lib/api/projects';
import { fetchProjectWorkspaces } from '@/lib/api/workspaces';
import { fetchWorkspaceWindows } from '@/lib/api/chat-windows';
import { fetchWindowMessages } from '@/lib/api/messages';
import type { ApiCallError } from '@/lib/api/client';
import type { ChatWindow } from '@webapp/types';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}

type ProjectLoad =
  | { source: 'api'; project: Project }
  | { source: 'mock'; project: Project }
  | { source: 'error'; message: string; project: Project | null };

type WorkspacesSource = 'api' | 'mock' | 'api error';

interface WorkspacesLoad {
  source: WorkspacesSource;
  workspaces: WorkspaceType[];
  message?: string;
}

type WindowsSource = 'api' | 'mock' | 'api error';

interface WindowsLoad {
  source: WindowsSource;
  windows: ChatWindow[];
  message?: string;
}

async function loadProject(id: string): Promise<ProjectLoad> {
  if (!getApiBaseUrl()) {
    const project = getMockProject(id);
    if (!project) return { source: 'mock', project: null as unknown as Project };
    return { source: 'mock', project };
  }
  try {
    const project = await fetchProject(id);
    return { source: 'api', project };
  } catch (err) {
    const e = err as ApiCallError;
    if (e.code === 'not_found' || e.status === 404) {
      return { source: 'error', message: e.message, project: null };
    }
    const fallback = getMockProject(id);
    return { source: 'error', message: e.message ?? 'Unknown error', project: fallback };
  }
}

async function loadWorkspaces(projectId: string, projectFromApi: boolean): Promise<WorkspacesLoad> {
  if (!projectFromApi || !getApiBaseUrl()) {
    return { source: 'mock', workspaces: listWorkspacesForProject(projectId) };
  }
  try {
    const workspaces = await fetchProjectWorkspaces(projectId);
    return { source: 'api', workspaces };
  } catch (err) {
    const e = err as ApiCallError;
    return {
      source: 'api error',
      workspaces: listWorkspacesForProject(projectId),
      message: e.message ?? 'Unknown error',
    };
  }
}

async function loadWindows(workspaceId: string, workspacesFromApi: boolean): Promise<WindowsLoad> {
  if (!workspacesFromApi || !getApiBaseUrl()) {
    return { source: 'mock', windows: getWindowsForWorkspace(workspaceId) };
  }
  try {
    const windows = await fetchWorkspaceWindows(workspaceId);
    return { source: 'api', windows };
  } catch (err) {
    const e = err as ApiCallError;
    return {
      source: 'api error',
      windows: getWindowsForWorkspace(workspaceId),
      message: e.message ?? 'Unknown error',
    };
  }
}

async function loadMessagesForWindows(
  windows: ChatWindow[],
  windowsFromApi: boolean,
): Promise<Record<string, MockMessage[]>> {
  const out: Record<string, MockMessage[]> = {};
  if (!windowsFromApi || !getApiBaseUrl()) {
    for (const w of windows) out[w.id] = getMessagesForWindow(w.id);
    return out;
  }
  const results = await Promise.all(
    windows.map(async (w) => {
      try {
        return [w.id, await fetchWindowMessages(w.id)] as const;
      } catch {
        return [w.id, getMessagesForWindow(w.id)] as const;
      }
    }),
  );
  for (const [id, msgs] of results) out[id] = msgs;
  return out;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params;
  const { workspace: workspaceParam } = await searchParams;

  const load = await loadProject(id);

  if (load.source === 'error' && !load.project) {
    return (
      <AppShell subtitle="Project" right={<SourceBadge load={load} />}>
        <ErrorPanel title="Project not found" message={load.message} />
      </AppShell>
    );
  }



  if (load.source === 'mock' && !load.project) {
    notFound();
  }

  const project = load.project!;
  const wsLoad = await loadWorkspaces(project.id, load.source === 'api');
  const projectWorkspaces = wsLoad.workspaces;

  if (projectWorkspaces.length === 0) {
    return (
      <AppShell subtitle="Project" right={<BadgeRow load={load} ws={wsLoad} />}>
        {load.source === 'error' ? (
          <ErrorPanel title="Using cached project" message={load.message} />
        ) : null}
        {wsLoad.source === 'api error' ? (
          <ErrorPanel title="Using cached workspaces" message={wsLoad.message ?? ''} />
        ) : null}
        <CreateWorkspaceCTA projectId={project.id} />
      </AppShell>
    );
  }

  let activeWorkspace = projectWorkspaces[0]!;
  let invalid = false;
  if (workspaceParam) {
    const requested = projectWorkspaces.find((w) => w.id === workspaceParam);
    if (requested) activeWorkspace = requested;
    else invalid = true;
  }

  if (invalid) {
    const fallback = projectWorkspaces[0]!;
    return (
      <AppShell subtitle="Project" right={<BadgeRow load={load} ws={wsLoad} />}>
        <CenteredMessage
          title="Workspace not found"
          subtitle={`The workspace "${workspaceParam}" does not belong to ${project.name}.`}
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

  const winLoad = await loadWindows(activeWorkspace.id, wsLoad.source === 'api');
  const ws = winLoad.windows;
  const messagesByWindow = await loadMessagesForWindows(ws, winLoad.source === 'api');

  return (
    <Workspace
      key={activeWorkspace.id}
      projectId={project.id}
      projectName={project.name}
      workspaces={projectWorkspaces}
      activeWorkspace={activeWorkspace}
      windows={ws}
      messagesByWindow={messagesByWindow}
    />
  );
}

function BadgeRow({ load, ws }: { load: ProjectLoad; ws: WorkspacesLoad }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <SourceBadge load={load} />
      <WorkspacesBadge ws={ws} />
    </span>
  );
}

function WorkspacesBadge({ ws }: { ws: WorkspacesLoad }) {
  const config =
    ws.source === 'api'
      ? { label: 'workspaces: api', color: '#10a37f' }
      : ws.source === 'mock'
        ? { label: 'workspaces: mock', color: '#8a8a95' }
        : { label: 'workspaces: api error', color: '#d97757' };
  const title =
    ws.source === 'api error'
      ? ws.message ?? 'Workspaces fetch failed; showing mock data'
      : ws.source === 'mock'
        ? 'Workspaces from local mock data'
        : 'Workspaces fetched from the API';
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
      title={title}
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

function SourceBadge({ load }: { load: ProjectLoad }) {
  const config =
    load.source === 'api'
      ? { label: 'api', color: '#10a37f' }
      : load.source === 'mock'
        ? { label: 'mock data', color: '#8a8a95' }
        : { label: 'api error', color: '#d97757' };

  const title =
    load.source === 'mock'
      ? 'Set NEXT_PUBLIC_API_URL in apps/web to fetch from the real API'
      : load.source === 'error'
        ? load.message
        : 'Fetched from the API';

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
      title={title}
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

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <section style={{ padding: '1.5rem', maxWidth: 720, width: '100%', margin: '0 auto' }}>
      <Panel style={{ padding: '1.25rem', borderColor: '#6b2a2a' }}>
        <div style={{ color: '#ffb4b4', fontSize: '0.95rem', fontWeight: 600 }}>{title}</div>
        <div style={{ color: '#d8a0a0', fontSize: '0.82rem', marginTop: 4, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
        <div style={{ color: '#8a8a95', fontSize: '0.78rem', marginTop: 10 }}>
          <Link href="/" style={{ color: '#8a8a95' }}>← Back to projects</Link>
        </div>
      </Panel>
    </section>
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
