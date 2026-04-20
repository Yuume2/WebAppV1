import { randomUUID } from 'node:crypto';
import type { AIProvider, ChatWindow } from '@webapp/types';
import { appendWindowId } from './workspaces.service.js';

let store: ChatWindow[] = [];

export function listChatWindows(workspaceId: string): ChatWindow[] {
  return store.filter((w) => w.workspaceId === workspaceId).map((w) => ({ ...w }));
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

export function chatWindowExists(id: string): boolean {
  return store.some((w) => w.id === id);
}
