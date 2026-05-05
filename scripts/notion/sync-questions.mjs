#!/usr/bin/env node
// scripts/notion/sync-questions.mjs
//
// Two-way bridge between GitHub `claude-question`/`claude-answer` issue comments
// and a Notion "Questions" database. **No secrets are baked in.** All credentials
// must come from environment variables.
//
// Required env:
//   NOTION_TOKEN                       Notion internal integration secret
//   NOTION_QUESTIONS_DATABASE_ID       distinct from NOTION_DATABASE_ID
//   GITHUB_TOKEN                       provided automatically in CI; locally use `gh auth token`
//   GITHUB_REPOSITORY                  e.g. Yuume2/WebAppV1
//
// Optional env:
//   DRY_RUN=1                          plan only, no Notion writes, no GitHub comments
//   ONLY_GH_TO_NOTION=1                skip Notion → GitHub direction
//   ONLY_NOTION_TO_GH=1                skip GitHub → Notion direction
//
// CLI flags:
//   --dry-run     (same as DRY_RUN=1)
//   --verbose     more logging
//
// On first run with no DB, the script prints the schema (see questions-schema.md)
// and exits 2. It never creates databases or properties for safety.

import process from 'node:process';
import { spawnSync } from 'node:child_process';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function die(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function envOrDie(name) {
  const v = process.env[name];
  if (!v) die(`missing env ${name}`);
  return v;
}

function args() {
  const a = process.argv.slice(2);
  return {
    dryRun: a.includes('--dry-run') || process.env.DRY_RUN === '1',
    verbose: a.includes('--verbose'),
    onlyGhToNotion: process.env.ONLY_GH_TO_NOTION === '1',
    onlyNotionToGh: process.env.ONLY_NOTION_TO_GH === '1',
  };
}

async function notionFetch(path, init = {}) {
  const r = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Notion ${init.method || 'GET'} ${path} → ${r.status}\n${body}`);
  }
  return r.json();
}

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim();
  die('cannot resolve GitHub token (no GITHUB_TOKEN env, gh auth token failed)');
}

async function ghFetch(path, init = {}) {
  const token = ghToken();
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`GitHub ${init.method || 'GET'} ${path} → ${r.status}\n${body}`);
  }
  return r.json();
}

// Marker parsers — duplicated minimally from tools/task-questions.mjs to keep
// scripts/ self-contained for CI runners.
const Q_MARKER = '<!-- claude-question v1';
const A_MARKER = '<!-- claude-answer';

function parseQ(body) {
  if (!body || !body.startsWith(Q_MARKER)) return null;
  const close = body.indexOf('-->');
  if (close === -1) return null;
  const meta = {};
  for (const raw of body.slice(Q_MARKER.length, close).split('\n')) {
    const m = raw.trim().match(/^([a-zA-Z][\w]*)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2];
  }
  return { meta, text: body.slice(close + 3).trim() };
}

function parseA(body) {
  if (!body || !body.startsWith(A_MARKER)) return null;
  const close = body.indexOf('-->');
  if (close === -1) return null;
  const m = body.slice(A_MARKER.length, close).match(/qid\s*:\s*(\S+)/i);
  if (!m) return null;
  return { qid: m[1], text: body.slice(close + 3).trim() };
}

async function listAllQuestionsAndAnswers(repo) {
  // Fetch all comments on all open issues. Paginated.
  // For a small repo (10 issues), this is fine. For larger, use issue search.
  const issues = await ghFetch(`/repos/${repo}/issues?state=open&per_page=100`);
  const out = { questions: [], answers: [] };
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const comments = await ghFetch(`/repos/${repo}/issues/${issue.number}/comments?per_page=100`);
    for (const co of comments) {
      const q = parseQ(co.body || '');
      if (q) out.questions.push({ ...q, issue: issue.number, commentId: co.id, htmlUrl: co.html_url, createdAt: co.created_at });
      const a = parseA(co.body || '');
      if (a) out.answers.push({ ...a, issue: issue.number, commentId: co.id, htmlUrl: co.html_url, createdAt: co.created_at, author: co.user?.login });
    }
  }
  return out;
}

async function fetchNotionPages(dbId) {
  const pages = [];
  let cursor;
  do {
    const r = await notionFetch(`/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ start_cursor: cursor, page_size: 100 }),
    });
    pages.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return pages;
}

function richText(s) { return [{ type: 'text', text: { content: (s || '').slice(0, 1900) } }]; }

function notionPropsForQuestion(q, repo) {
  const url = q.htmlUrl;
  return {
    Title:                 { title: richText(q.meta.qid) },
    Task:                  { number: Number(q.meta.taskIssue) || null },
    'GitHub URL':          { url },
    'Block level':         { select: { name: q.meta.blockLevel || 'soft' } },
    Status:                { select: { name: q.meta.status || 'pending' } },
    Question:              { rich_text: richText(q.text) },
    'Default if no answer':{ rich_text: richText(q.meta.defaultIfNoAnswer || 'skip') },
    'Created at':          { date: { start: q.meta.createdAt || q.createdAt } },
    'Issue ID':            { number: q.commentId },
    'Last synced at':      { date: { start: new Date().toISOString() } },
  };
}

async function ghToNotion(repo, dbId, dryRun, verbose) {
  const { questions } = await listAllQuestionsAndAnswers(repo);
  const pages = await fetchNotionPages(dbId);
  const byQid = new Map();
  for (const p of pages) {
    const title = p.properties?.Title?.title?.[0]?.plain_text;
    if (title) byQid.set(title, p);
  }
  let created = 0, updated = 0;
  for (const q of questions) {
    const props = notionPropsForQuestion(q, repo);
    const existing = byQid.get(q.meta.qid);
    if (existing) {
      if (dryRun) { if (verbose) console.log(`[dry] update ${q.meta.qid}`); updated++; continue; }
      await notionFetch(`/pages/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
      updated++;
    } else {
      if (dryRun) { if (verbose) console.log(`[dry] create ${q.meta.qid}`); created++; continue; }
      await notionFetch('/pages', { method: 'POST', body: JSON.stringify({
        parent: { database_id: dbId },
        properties: props,
      }) });
      created++;
    }
  }
  console.log(`gh→notion: created=${created} updated=${updated} total=${questions.length}`);
}

async function notionToGh(repo, dbId, dryRun, verbose) {
  const pages = await fetchNotionPages(dbId);
  const { answers } = await listAllQuestionsAndAnswers(repo);
  const answeredQids = new Set(answers.map((a) => a.qid));

  let posted = 0, skipped = 0;
  for (const p of pages) {
    const props = p.properties || {};
    const qid = props.Title?.title?.[0]?.plain_text;
    const status = props.Status?.select?.name;
    const answerText = (props.Answer?.rich_text || []).map((rt) => rt.plain_text).join('').trim();
    const issueNum = props.Task?.number;
    if (!qid || !issueNum) continue;
    if (status !== 'answered') continue;
    if (!answerText) continue;
    if (answeredQids.has(qid)) { skipped++; continue; }

    const body = `<!-- claude-answer qid: ${qid} -->\n\n${answerText}`;
    if (dryRun) { if (verbose) console.log(`[dry] would post answer for ${qid} on #${issueNum}`); posted++; continue; }
    await ghFetch(`/repos/${repo}/issues/${issueNum}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    posted++;
  }
  console.log(`notion→gh: posted=${posted} skipped(already-on-gh)=${skipped}`);
}

async function main() {
  const a = args();
  const repo = envOrDie('GITHUB_REPOSITORY');
  envOrDie('NOTION_TOKEN');
  const dbId = envOrDie('NOTION_QUESTIONS_DATABASE_ID');

  console.log(`mode: ${a.dryRun ? 'DRY-RUN' : 'APPLY'}  repo: ${repo}  db: ${dbId.slice(0, 4)}…`);

  if (!a.onlyNotionToGh) await ghToNotion(repo, dbId, a.dryRun, a.verbose);
  if (!a.onlyGhToNotion) await notionToGh(repo, dbId, a.dryRun, a.verbose);

  if (a.dryRun) console.log('done (dry-run, nothing written).');
  else console.log('done.');
}

main().catch((e) => die(e.message));
