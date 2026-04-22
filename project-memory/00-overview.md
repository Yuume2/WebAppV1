# 00 — Overview

## What

AI Workspace V1. Monorepo. Single-user tool to connect multiple AI provider API keys and run independent chat windows organized into projects.

## Why

Users juggle AI providers across tabs. No shared context, no persistence. This gives one workspace with bring-your-own-key, multi-provider, workspace-first UX.

## Scope today (V1 MVP)

- Auth (basic, single user) — **not implemented yet**
- API key connect for OpenAI / Anthropic / Perplexity — **not implemented yet**
- Projects (create / list / rename / delete) — **list only, read-only seed**
- Workspace canvas with multi chat windows per project — **UI-only, local state**
- Independent conversation context per window — **UI-only, no persistence**
- Conversation persistence — **not implemented yet**

## Out of scope (post-V1)

Teams, billing, fine-tunes/RAG/uploads, mobile, plugins, shared keys.

## Current global state

- Frontend UI skeleton done, runs against mock data by default.
- Homepage project list wired to real backend `GET /v1/projects` when `NEXT_PUBLIC_API_URL` set.
- Backend foundation done: router, controller, service, env, logger, request-id, vitest.
- Only read-only `/v1/projects` + `/health` exist. No DB. No auth. No providers.
- Shared types define `Project`, `Workspace`, `ChatWindow`, `ApiResponse`, `HealthStatus`, `ApiError`, `AIProvider`.

## High-priority next

1. Backend `GET /v1/projects/:id` (needs dynamic router — WIP stashed locally).
2. Backend workspace endpoints.
3. Persistence layer choice (DB TBD).
4. Auth + provider key storage.
