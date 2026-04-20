import { randomUUID } from 'node:crypto';
import type { Message, MessageRole } from '@webapp/types';

let store: Message[] = [];

export function listMessages(chatWindowId: string): Message[] {
  return store
    .filter((m) => m.chatWindowId === chatWindowId)
    .map((m) => ({ ...m }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function createMessage(chatWindowId: string, role: MessageRole, content: string): Message {
  const now = new Date().toISOString();
  const msg: Message = { id: randomUUID(), chatWindowId, role, content, createdAt: now };
  store.push(msg);
  return { ...msg };
}

export function findMessage(id: string): Message | undefined {
  const m = store.find((m) => m.id === id);
  return m ? { ...m } : undefined;
}
