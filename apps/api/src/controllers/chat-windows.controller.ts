import type { AIProvider, ChatWindow } from '@webapp/types';
import { getChatWindowPath } from '@webapp/types';
import {
  parseJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { s } from '../lib/schema.js';
import { createChatWindow, findChatWindow, listChatWindows } from '../services/chat-windows.service.js';
import { workspaceExists } from '../services/workspaces.service.js';

const AI_PROVIDERS = ['openai', 'anthropic', 'perplexity'] as const;

const CreateChatWindowBody = s.object({
  workspaceId: s.string({ min: 1 }),
  title:       s.string({ min: 1, max: 200, trim: true }),
  provider:    s.enumOf<AIProvider>(AI_PROVIDERS),
  model:       s.string({ min: 1, max: 200, trim: true }),
});

export function listChatWindowsController(ctx: RequestContext): InternalResult {
  const workspaceId = ctx.url.searchParams.get('workspaceId');
  if (!workspaceId) {
    return respondError('validation_error', 'Query param workspaceId is required');
  }
  return respond(listChatWindows(workspaceId));
}

export async function createChatWindowController(ctx: RequestContext): Promise<InternalResult> {
  const body = await parseJsonBody(ctx, CreateChatWindowBody);
  if (!body.ok) return body.result;

  if (!workspaceExists(body.value.workspaceId)) {
    return respondNotFound(`Workspace ${body.value.workspaceId} not found`);
  }

  const cw: ChatWindow = createChatWindow(
    body.value.workspaceId,
    body.value.title,
    body.value.provider,
    body.value.model,
  );
  return respondCreated(cw, getChatWindowPath(cw.id));
}

export function getChatWindowController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const cw = findChatWindow(id);
  return cw ? respond(cw) : respondNotFound(`ChatWindow ${id} not found`);
}
