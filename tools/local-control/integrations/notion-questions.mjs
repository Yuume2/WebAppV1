import { request } from 'node:https';

const NOTION_VERSION = '2022-06-28';

export const NOTION_PROPERTIES_EXPECTED = Object.freeze([
  'Name',
  'Question ID',
  'Issue Number',
  'Status',
  'Block Level',
  'Question',
  'Options',
  'Claude Recommendation',
  'Human Answer',
  'Source',
  'GitHub URL',
  'Created At',
  'Answered At',
]);

export function evaluateNotionConfig(env) {
  const token = (env.NOTION_TOKEN ?? '').trim();
  const dbId = (env.NOTION_QUESTIONS_DATABASE_ID ?? '').trim();
  const configured = !!(token && dbId);
  return {
    configured,
    token: configured ? token : null,
    databaseId: configured ? dbId : null,
    missing: [
      !token ? 'NOTION_TOKEN' : null,
      !dbId ? 'NOTION_QUESTIONS_DATABASE_ID' : null,
    ].filter(Boolean),
  };
}

function notionFetch({ token, path, method = 'GET', body = null, timeoutMs = 8000 }) {
  return new Promise((resolveP) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = request({
      hostname: 'api.notion.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* keep raw */ }
        resolveP({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', (err) => resolveP({ ok: false, status: 0, body: null, raw: '', error: err.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('notion request timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

export async function validateNotionDatabase({ token, databaseId, fetcher = notionFetch }) {
  const res = await fetcher({ token, path: `/v1/databases/${databaseId}` });
  if (!res.ok) {
    return { ok: false, status: res.status, reason: res.body?.message ?? res.error ?? `HTTP ${res.status}`, missing: [], extras: [] };
  }
  const props = res.body?.properties ?? {};
  const have = Object.keys(props);
  const missing = NOTION_PROPERTIES_EXPECTED.filter((p) => !have.includes(p));
  return {
    ok: missing.length === 0,
    status: res.status,
    reason: missing.length === 0 ? null : `missing properties: ${missing.join(', ')}`,
    missing,
    extras: have.filter((p) => !NOTION_PROPERTIES_EXPECTED.includes(p)),
    have,
  };
}

function richText(s) { return [{ type: 'text', text: { content: String(s ?? '').slice(0, 2000) } }]; }

export function buildQuestionPage({ databaseId, question }) {
  const q = question || {};
  const title = q.title ?? `Q ${q.id ?? ''}`;
  return {
    parent: { database_id: databaseId },
    properties: {
      'Name': { title: richText(title) },
      'Question ID': { rich_text: richText(q.id ?? '') },
      'Issue Number': { number: Number.isFinite(q.issue) ? q.issue : null },
      'Status': { select: { name: q.status ?? 'open' } },
      'Block Level': { select: { name: q.blockLevel ?? 'soft' } },
      'Question': { rich_text: richText(q.question ?? '') },
      'Options': { rich_text: richText((q.options ?? []).join(' | ')) },
      'Claude Recommendation': { rich_text: richText(q.recommendation ?? '') },
      'Source': { select: { name: q.source ?? 'github' } },
      'GitHub URL': { url: q.githubUrl ?? null },
      'Created At': q.createdAt ? { date: { start: q.createdAt } } : { date: null },
    },
  };
}

export async function findQuestionPageByQid({ token, databaseId, qid, fetcher = notionFetch }) {
  const res = await fetcher({
    token,
    path: `/v1/databases/${databaseId}/query`,
    method: 'POST',
    body: {
      filter: { property: 'Question ID', rich_text: { equals: String(qid) } },
      page_size: 1,
    },
  });
  if (!res.ok) return null;
  return res.body?.results?.[0] ?? null;
}

export async function upsertQuestion({ token, databaseId, question, fetcher = notionFetch }) {
  const existing = await findQuestionPageByQid({ token, databaseId, qid: question.id, fetcher });
  if (existing) {
    const patch = buildQuestionPage({ databaseId, question }).properties;
    delete patch['Created At'];
    const res = await fetcher({ token, path: `/v1/pages/${existing.id}`, method: 'PATCH', body: { properties: patch } });
    return { ok: res.ok, mode: 'update', pageId: existing.id, status: res.status, reason: res.body?.message ?? null };
  }
  const res = await fetcher({ token, path: '/v1/pages', method: 'POST', body: buildQuestionPage({ databaseId, question }) });
  return { ok: res.ok, mode: 'create', pageId: res.body?.id ?? null, status: res.status, reason: res.body?.message ?? null };
}

export async function listAnsweredQuestions({ token, databaseId, fetcher = notionFetch }) {
  const res = await fetcher({
    token,
    path: `/v1/databases/${databaseId}/query`,
    method: 'POST',
    body: {
      filter: { property: 'Status', select: { equals: 'answered' } },
      page_size: 50,
    },
  });
  if (!res.ok) return { ok: false, items: [], reason: res.body?.message ?? `HTTP ${res.status}` };
  const items = (res.body?.results ?? []).map((page) => {
    const props = page.properties ?? {};
    const text = (p) => (p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? '');
    return {
      pageId: page.id,
      qid: text(props['Question ID']),
      issue: props['Issue Number']?.number ?? null,
      answer: text(props['Human Answer']),
      answeredAt: props['Answered At']?.date?.start ?? null,
    };
  }).filter((x) => x.qid && x.answer);
  return { ok: true, items, reason: null };
}
