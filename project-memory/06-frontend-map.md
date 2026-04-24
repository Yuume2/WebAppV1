# 06 — Frontend Map

App: `apps/web`. Next.js 15 App Router. TS strict. Path alias `@/* → src/*`.

**Current status: read-only + local state.** No write clients, no auth UI, no provider-settings UI. The backend already supports all of those — the web app has simply not been wired to them yet. Tracking: issues #16, #17, #18, #19, #20, #28, #36, #37, #38, #41.

## Routes

| Route               | File                                    | Data source                                     |
|---------------------|-----------------------------------------|-------------------------------------------------|
| `/`                 | `src/app/page.tsx`                      | `lib/api/projects` if `NEXT_PUBLIC_API_URL`, else `lib/mocks` |
| `/project/[id]`     | `src/app/project/[id]/page.tsx`         | `fetchProject(id)` + `fetchProjectWorkspaces(id)` + `fetchWorkspaceWindows(activeWsId)` + per-window `fetchWindowMessages(winId)` (parallel). Mock fallback at every layer. |

Layout: `src/app/layout.tsx`. No auth-gated routes exist yet (#17).

## Features

- `features/workspace/`
  - `Workspace.tsx` — shell for canvas + sidebar.
  - `WorkspaceCanvas.tsx` — renders chat windows.
  - `WorkspaceSidebar.tsx` — workspace list (shared window manager).
  - `NewWindowComposer.tsx` — create window with preset (local-only, does not POST).
  - `useWorkspaceState.ts` — local React state, window lifecycle (create/rename/focus).
- `features/chat/`
  - `ChatWindow.tsx` — single chat window UI.
  - `useChatSessions.ts` — per-window session state (local only; no POST message yet).

## Components

- `AppShell.tsx`, `Panel.tsx`, `Button.tsx` in `src/components/`.

## lib

- `lib/api/env.ts` — `getApiBaseUrl()`, returns `null` when `NEXT_PUBLIC_API_URL` is unset.
- `lib/api/client.ts` — `apiFetch<T>` with 5s default timeout, `cache: 'no-store'`, envelope validation, throws `ApiCallError` on failure.
- `lib/api/projects.ts` — `fetchProjects`, `fetchProject`.
- `lib/api/workspaces.ts` — `fetchProjectWorkspaces`.
- `lib/api/windows.ts` — `fetchWorkspaceWindows` (hits legacy alias `GET /v1/workspaces/:id/windows`).
- `lib/api/messages.ts` — `fetchWindowMessages` (hits legacy alias `GET /v1/windows/:id/messages`).
- `lib/data/index.ts` — mock-backed read API for routes other than `/`.
- `lib/data/presets.ts` — window preset definitions.
- `lib/mocks/fixtures.ts` — static mock data.

All current clients are **read-only**. A canonical-path migration (`/v1/chat-windows`, `/v1/messages`) is tracked in #38. Write clients for projects/workspaces/chat-windows and POST-message are in #19 / #28.

## Styles

`src/styles/globals.css`. No Tailwind installed yet; plain CSS.

## State model

- Workspace + windows = local React state (`useWorkspaceState`, `useChatSessions`). Not persisted.
- Workspace selected via URL query `?workspace=…`.
- No global store (Redux/Zustand). No session / auth state.
- No optimistic writes (will land with #28).

## Env

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL` (toggles real-API vs mock). See `apps/web/.env.example`.

Sentry browser SDK init is tracked in #41 — not yet present on web (backend-only today).

## Dev

```bash
pnpm --filter @webapp/web dev
```

## Where to add what

- New page → `src/app/<route>/page.tsx`.
- Shared primitive → `src/components/`.
- Feature module → `src/features/<name>/`.
- API call → `src/lib/api/<resource>.ts` then consume in a component/hook.
- Mock data helper → `src/lib/data/` or `src/lib/mocks/`.
