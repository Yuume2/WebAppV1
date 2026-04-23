import type { CreateMessageInput, Message, MessageRole } from '@webapp/types';
import { getMessagePath } from '@webapp/types';
import {
  isRecord,
  readJsonBody,
  respond,
  respondCreated,
  respondError,
  respondNotFound,
  type InternalResult,
  type RequestContext,
} from '../lib/http.js';
import { chatWindowExists } from '../services/chat-windows.service.js';
import { createMessage, findMessage, listMessages } from '../services/messages.service.js';

const MESSAGE_ROLES: MessageRole[] = ['user', 'assistant', 'system'];

function isMessageRole(v: unknown): v is MessageRole {
  return MESSAGE_ROLES.includes(v as MessageRole);
}

export function listMessagesController(ctx: RequestContext): InternalResult {
  const chatWindowId = ctx.url.searchParams.get('chatWindowId');
  if (!chatWindowId) {
    return respondError('validation_error', 'Query param chatWindowId is required');
  }
  return respond(listMessages(chatWindowId));
}

export async function createMessageController(ctx: RequestContext): Promise<InternalResult> {
  const bodyResult = await readJsonBody(ctx.req);
  if (!bodyResult.ok) return bodyResult.result;
  const body = bodyResult.data;

  if (!isRecord(body)) return respondError('validation_error', 'Body must be a JSON object');
  if (typeof body.chatWindowId !== 'string' || !body.chatWindowId) {
    return respondError('validation_error', 'chatWindowId is required');
  }
  if (!isMessageRole(body.role)) {
    return respondError('validation_error', `role must be one of: ${MESSAGE_ROLES.join(', ')}`);
  }
  if (typeof body.content !== 'string' || !body.content) {
    return respondError('validation_error', 'content is required and must be a non-empty string');
  }

  const input = body as unknown as CreateMessageInput;

  if (!chatWindowExists(input.chatWindowId)) {
    return respondNotFound(`ChatWindow ${input.chatWindowId} not found`);
  }

  const msg: Message = createMessage(input.chatWindowId, input.role, input.content);
  return respondCreated(msg, getMessagePath(msg.id));
}

export function getMessageController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const msg = findMessage(id);
  return msg ? respond(msg) : respondNotFound(`Message ${id} not found`);
}
