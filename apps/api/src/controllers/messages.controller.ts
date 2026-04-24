import type { Message, MessageRole } from '@webapp/types';
import { getMessagePath } from '@webapp/types';
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
import { chatWindowExists } from '../services/chat-windows.service.js';
import { createMessage, findMessage, listMessages } from '../services/messages.service.js';

const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

const CreateMessageBody = s.object({
  chatWindowId: s.string({ min: 1 }),
  role:         s.enumOf<MessageRole>(MESSAGE_ROLES),
  content:      s.string({ min: 1, max: 32_000 }),
});

export function listMessagesController(ctx: RequestContext): InternalResult {
  const chatWindowId = ctx.url.searchParams.get('chatWindowId');
  if (!chatWindowId) {
    return respondError('validation_error', 'Query param chatWindowId is required');
  }
  return respond(listMessages(chatWindowId));
}

export async function createMessageController(ctx: RequestContext): Promise<InternalResult> {
  const body = await parseJsonBody(ctx, CreateMessageBody);
  if (!body.ok) return body.result;

  if (!chatWindowExists(body.value.chatWindowId)) {
    return respondNotFound(`ChatWindow ${body.value.chatWindowId} not found`);
  }

  const msg: Message = createMessage(body.value.chatWindowId, body.value.role, body.value.content);
  return respondCreated(msg, getMessagePath(msg.id));
}

export function getMessageController(ctx: RequestContext): InternalResult {
  const id = ctx.params['id'] ?? '';
  const msg = findMessage(id);
  return msg ? respond(msg) : respondNotFound(`Message ${id} not found`);
}
