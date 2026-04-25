import { randomUUID } from 'node:crypto';
import type { AIProvider, ChatWindow } from '@webapp/types';
import { appendWindowId } from './workspaces.service.js';

let store: ChatWindow[] = [];

export function listChatWindows(workspaceId: string): ChatWindow[] {
  return store
    .filter((w) => w.workspaceId === workspaceId)
    .map((w) => ({ ...w }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function createChatWindow(
  workspaceId: string,
  title: string,
  provider: AIProvider,
  model: string,
): ChatWindow {
  const now = new Date().toISOString();
  const cw: ChatWindow = { id: randomUUID(), workspaceId, title, provider, model, createdAt: now, updatedAt: now };
  store.push(cw);
  appendWindowId(workspaceId, cw.id);
  return { ...cw };
}

export function findChatWindow(id: string): ChatWindow | undefined {
  const w = store.find((w) => w.id === id);
  return w ? { ...w } : undefined;
}

export function chatWindowExists(id: string): boolean {
  return store.some((w) => w.id === id);
}

export function updateChatWindow(
  id: string,
  patch: { title?: string; model?: string },
): ChatWindow | undefined {
  const cw = store.find((w) => w.id === id);
  if (!cw) return undefined;
  if (patch.title !== undefined) cw.title = patch.title;
  if (patch.model !== undefined) cw.model = patch.model;
  cw.updatedAt = new Date().toISOString();
  return { ...cw };
}

export function deleteChatWindow(id: string): boolean {
  const i = store.findIndex((w) => w.id === id);
  if (i === -1) return false;
  store.splice(i, 1);
  return true;
}

export function resetChatWindowsStore(): void {
  store = [];
}

export function insertChatWindowRaw(chatWindow: ChatWindow): void {
  store.push(chatWindow);
}
