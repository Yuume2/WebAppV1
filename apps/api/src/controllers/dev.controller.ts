import type { AppState, ChatWindow, Message, Project, Workspace } from '@webapp/types';
import { respond, type InternalResult, type RequestContext } from '../lib/http.js';
import { insertChatWindowRaw, resetChatWindowsStore } from '../services/chat-windows.service.js';
import { insertMessageRaw, resetMessagesStore } from '../services/messages.service.js';
import { insertProjectRaw, resetProjectsStore } from '../services/projects.service.js';
import { insertWorkspaceRaw, resetWorkspacesStore } from '../services/workspaces.service.js';

function resetAll(): void {
  resetProjectsStore();
  resetWorkspacesStore();
  resetChatWindowsStore();
  resetMessagesStore();
}

export function devResetController(_ctx: RequestContext): InternalResult {
  resetAll();
  return respond({ reset: true });
}

// ── Deterministic seed data ──────────────────────────────────────────────────

const SEED_TS = '2026-04-20T00:00:00.000Z';

const SEED_PROJECTS: Project[] = [
  { id: 'demo-proj-1', name: 'AI Research Hub', description: 'Compare responses across providers on the same topic', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'demo-proj-2', name: 'Content Workshop', description: 'Draft and refine content using multiple models', createdAt: SEED_TS, updatedAt: SEED_TS },
];

const SEED_WORKSPACES: Workspace[] = [
  { id: 'demo-ws-1', projectId: 'demo-proj-1', name: 'LLM Comparison', windowIds: ['demo-cw-1', 'demo-cw-2'], createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'demo-ws-2', projectId: 'demo-proj-2', name: 'Blog Drafts', windowIds: ['demo-cw-3'], createdAt: SEED_TS, updatedAt: SEED_TS },
];

const SEED_CHAT_WINDOWS: ChatWindow[] = [
  { id: 'demo-cw-1', workspaceId: 'demo-ws-1', title: 'OpenAI', provider: 'openai', model: 'gpt-4o', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'demo-cw-2', workspaceId: 'demo-ws-1', title: 'Anthropic', provider: 'anthropic', model: 'claude-3-5-sonnet', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'demo-cw-3', workspaceId: 'demo-ws-2', title: 'Perplexity', provider: 'perplexity', model: 'sonar', createdAt: SEED_TS, updatedAt: SEED_TS },
];

const SEED_MESSAGES: Message[] = [
  { id: 'demo-msg-1', chatWindowId: 'demo-cw-1', role: 'user',      content: 'Explain the difference between RAG and fine-tuning.', createdAt: SEED_TS },
  { id: 'demo-msg-2', chatWindowId: 'demo-cw-1', role: 'assistant', content: 'RAG retrieves external context at inference time. Fine-tuning bakes knowledge into model weights during training.', createdAt: SEED_TS },
  { id: 'demo-msg-3', chatWindowId: 'demo-cw-2', role: 'user',      content: 'Explain the difference between RAG and fine-tuning.', createdAt: SEED_TS },
  { id: 'demo-msg-4', chatWindowId: 'demo-cw-3', role: 'user',      content: 'Write an intro paragraph for a post about AI workspaces.', createdAt: SEED_TS },
];

export function devSeedController(_ctx: RequestContext): InternalResult {
  resetAll();

  for (const p of SEED_PROJECTS)     insertProjectRaw(p);
  for (const w of SEED_WORKSPACES)   insertWorkspaceRaw(w);
  for (const c of SEED_CHAT_WINDOWS) insertChatWindowRaw(c);
  for (const m of SEED_MESSAGES)     insertMessageRaw(m);

  const state: AppState = {
    projects:    SEED_PROJECTS.map((p) => ({ ...p })),
    workspaces:  SEED_WORKSPACES.map((w) => ({ ...w, windowIds: [...w.windowIds] })),
    chatWindows: SEED_CHAT_WINDOWS.map((c) => ({ ...c })),
    messages:    SEED_MESSAGES.map((m) => ({ ...m })),
  };
  return respond({ seeded: true, state });
}
