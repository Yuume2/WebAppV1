import type { Project, Workspace } from '@webapp/types';
import { s } from '@/app/ws-styles';

interface Props {
  projects: Project[];
  workspaces: Workspace[];
  projectId: string | null;
  workspaceId: string | null;
  onSelectProject: (id: string) => void;
  onSelectWorkspace: (id: string) => void;
  newProjectName: string;
  onNewProjectName: (v: string) => void;
  onCreateProject: () => void;
  projectPending: boolean;
  projectError: string | null;
  newWorkspaceName: string;
  onNewWorkspaceName: (v: string) => void;
  onCreateWorkspace: () => void;
  workspacePending: boolean;
  workspaceError: string | null;
}

export function Sidebar({
  projects, workspaces, projectId, workspaceId,
  onSelectProject, onSelectWorkspace,
  newProjectName, onNewProjectName, onCreateProject, projectPending, projectError,
  newWorkspaceName, onNewWorkspaceName, onCreateWorkspace, workspacePending, workspaceError,
}: Props) {
  const selProject = projects.find(p => p.id === projectId);

  return (
    <div style={s.sidebar}>
      <div style={s.colSection}>
        <p style={s.colLabel}>Projects</p>
        {projects.length === 0 && <p style={s.muted}>No projects yet — create one below.</p>}
        {projects.map(p => (
          <div
            key={p.id}
            style={{ ...s.navItem, ...(p.id === projectId ? s.navItemActive : {}) }}
            onClick={() => onSelectProject(p.id)}
          >
            {p.name}
          </div>
        ))}
        <div style={s.inlineForm}>
          <input
            style={s.input}
            placeholder="New project…"
            value={newProjectName}
            onChange={e => onNewProjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onCreateProject()}
            disabled={projectPending}
          />
          <button style={s.iconBtn} onClick={onCreateProject} disabled={projectPending || !newProjectName.trim()}>+</button>
        </div>
        {projectError && <p style={s.errText}>{projectError}</p>}
      </div>

      {selProject && (
        <div style={s.colSection}>
          <p style={s.colLabel}>Workspaces</p>
          <p style={s.dimLabel}>{selProject.name}</p>
          {workspaces.length === 0 && <p style={s.muted}>No workspaces — create one below.</p>}
          {workspaces.map(ws => (
            <div
              key={ws.id}
              style={{ ...s.navItem, ...(ws.id === workspaceId ? s.navItemActive : {}) }}
              onClick={() => onSelectWorkspace(ws.id)}
            >
              {ws.name}
            </div>
          ))}
          <div style={s.inlineForm}>
            <input
              style={s.input}
              placeholder="New workspace…"
              value={newWorkspaceName}
              onChange={e => onNewWorkspaceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onCreateWorkspace()}
              disabled={workspacePending}
            />
            <button style={s.iconBtn} onClick={onCreateWorkspace} disabled={workspacePending || !newWorkspaceName.trim()}>+</button>
          </div>
          {workspaceError && <p style={s.errText}>{workspaceError}</p>}
        </div>
      )}
    </div>
  );
}
