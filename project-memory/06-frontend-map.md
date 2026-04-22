# 06 — Frontend Map

App: `apps/web`. Next.js 15 App Router. TS strict. Path alias `@/* → src/*`.

## Routes

| Route               | File                                    | Data source                                     |
|---------------------|-----------------------------------------|-------------------------------------------------|
| `/`                 | `src/app/page.tsx`                      | `lib/api/projects` if `NEXT_PUBLIC_API_URL`, else `lib/mocks` |
| `/project/[id]`     | `src/app/project/[id]/page.tsx`         | `fetchProject(id)` + `fetchProjectWorkspaces(id)` + `fetchWorkspaceWindows(activeWsId)` + per-window `fetchWindowMessages(winId)` (parallel). Mock fallback at every layer. |

Layout: `src/app/layout.tsx`.

## Features

- `features/workspace/`
  - `Workspace.tsx` (client) — shell for canvas + sidebar.
  - `WorkspaceCanvas.tsx` — renders chat windows.
  - `WorkspaceSidebar.tsx` — workspace list (shared window manager).
  - `NewWindowComposer.tsx` — create window with preset.
  - `useWorkspaceState.ts` — local state, window lifecycle (create/rename/focus).
- `features/chat/`
  - `ChatWindow.tsx` — single chat window UI.
  - `useChatSessions.ts` — per-window independent session state (local only).

## Components

- `AppShell.tsx`, `Panel.tsx`, `Button.tsx` in `src/components/`.

## lib

- `lib/api/env.ts` — `getApiBaseUrl()`, trims trailing slashes, returns `null` when unset.
- `lib/api/client.ts` — `apiFetch<T>(path, { timeoutMs?, signal?, cache? })`; default 5s timeout, `cache: 'no-store'`; validates envelope, throws `ApiCallError` with `code`/`status` on failure.
- `lib/api/projects.ts` — `fetchProjects(signal?)`, `fetchProject(id, signal?)`.
- `lib/api/workspaces.ts` — `fetchProjectWorkspaces(projectId, signal?)`.
- `lib/api/windows.ts` — `fetchWorkspaceWindows(workspaceId, signal?)`.
- `lib/api/messages.ts` — `fetchWindowMessages(windowId, signal?)`.
- `lib/data/index.ts` — mock-backed read API for projects, workspaces, windows; used by routes other than homepage.
- `lib/data/presets.ts` — window preset definitions.
- `lib/mocks/fixtures.ts` — static mock data.

## Styles

`src/styles/globals.css`. No Tailwind installed (yet); plain CSS.

## State model

- Workspace + windows = local React state (`useWorkspaceState`, `useChatSessions`). Not persisted.
- Workspace selected via URL query `?workspace=…`.
- No global store (Redux/Zustand). Stays local to features.

## Env

- `NEXT_PUBLIC_APP_URL` (frontend URL)
- `NEXT_PUBLIC_API_URL` (backend base; toggles real-API vs mock)

## Dev

```bash
pnpm --filter @webapp/web dev
```

## Where to add what

- New page → `src/app/<route>/page.tsx`.
- Shared primitive (button, panel…) → `src/components/`.
- Feature module (self-contained UI + hooks) → `src/features/<name>/`.
- API call → `src/lib/api/<resource>.ts` then consume in a component/hook.
- Mock data helper → `src/lib/data/` or `src/lib/mocks/`.
