import type { ApiResponse, Message } from '@webapp/types';
import { HttpError, ok } from '../lib/http.js';
import type { RequestContext } from '../lib/http.js';
import { windowExists } from '../services/windows.service.js';
import { listMessagesByWindowId } from '../services/messages.service.js';

export function listWindowMessagesController(
  ctx: RequestContext,
): ApiResponse<Message[]> {
  const id = ctx.params.id;
  if (!id) throw HttpError.notFound(`No window with id ""`);
  if (!windowExists(id)) throw HttpError.notFound(`No window with id "${id}"`);
  return ok(listMessagesByWindowId(id));
}
