import type { AIProvider, ChatWindow, CreateChatWindowInput } from '@webapp/types';
import {
  isRecord,
  readBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { createChatWindow, findChatWindow, listChatWindows } from '../services/chat-windows.service.js';
import { workspaceExists } from '../services/workspaces.service.js';

const AI_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'perplexity'];

function isAIProvider(v: unknown): v is AIProvider {
  return AI_PROVIDERS.includes(v as AIProvider);
}

export function listChatWindowsController(ctx: RequestContext): InternalResult {
  const workspaceId = ctx.url.searchParams.get('workspaceId');
  if (!workspaceId) {
    return respondError('validation_error', 'Query param workspaceId is required');
  }
  return respond(listChatWindows(workspaceId));
}

export async function createChatWindowController(ctx: RequestContext): Promise<InternalResult> {
  let body: unknown;
  try {
    body = await readBody(ctx.req);
  } catch {
    return respondError('invalid_json', 'Request body must be valid JSON');
  }

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    return respondError('validation_error', 'workspaceId is required');
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return respondError('validation_error', 'title is required and must be a non-empty string');
  }
  if (!isAIProvider(body.provider)) {
    return respondError('validation_error', `provider must be one of: ${AI_PROVIDERS.join(', ')}`);
  }
  if (typeof body.model !== 'string' || !body.model.trim()) {
    return respondError('validation_error', 'model is required and must be a non-empty string');
  }

  const input = body as unknown as CreateChatWindowInput;

  if (!workspaceExists(input.workspaceId)) {
    return respondNotFound(`Workspace ${input.workspaceId} not found`);
  }

  const cw: ChatWindow = createChatWindow(input.workspaceId, input.title.trim(), input.provider, input.model.trim());
  return respondCreated(cw);
}

export function getChatWindowController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const cw = findChatWindow(id);
  return cw ? respond(cw) : respondNotFound(`ChatWindow ${id} not found`);
}
