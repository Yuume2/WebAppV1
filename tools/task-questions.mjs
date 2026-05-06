#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// task-questions — Q/A workflow over GitHub issue comments.
//
// A question is a GitHub issue comment whose body starts with the marker:
//
//   <!-- claude-question v1
//   qid: q-<issue>-<seq>
//   blockLevel: hard|soft|nice
//   status: pending
//   defaultIfNoAnswer: skip|continue|<choice-letter>
//   defaultDelayHours: 24
//   createdAt: <ISO>
//   -->
//
// An answer is either:
//   - a comment whose body starts with `<!-- claude-answer qid: q-... -->`
//     posted by Yume directly on GitHub, OR
//   - posted later by the n8n bridge from Notion DB Questions.
//
// CLI:
//   list        list pending questions for a given issue (or all open issues)
//   ask         post a new question on an issue
//   read        read a question by qid (returns JSON)
//   answers     list answers for a qid
//   resolve     mark a question as answered locally (writes follow-up comment)

const MARKER_OPEN = '<!-- claude-question v1';
const ANSWER_MARKER = '<!-- claude-answer';
const VALID_BLOCK = new Set(['hard', 'soft', 'nice']);
const VALID_STATUS = new Set(['pending', 'answered', 'obsolete']);

const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) { console.error(c.red(`error: ${msg}`)); process.exit(1); }

function run(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ghJson(args) {
  const r = run('gh', args);
  if (r.code !== 0) die(`gh ${args.join(' ')}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

export function parseQuestionComment(commentBody) {
  if (!commentBody || !commentBody.startsWith(MARKER_OPEN)) return null;
  const close = commentBody.indexOf('-->');
  if (close === -1) return null;
  const headerInner = commentBody.slice(MARKER_OPEN.length, close);
  const meta = {};
  for (const raw of headerInner.split('\n')) {
    const line = raw.trim();
    const kv = line.match(/^([a-zA-Z][\w]*)\s*:\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  const text = commentBody.slice(close + 3).trim();
  return { meta, text };
}

export function parseQuestionPayload(text) {
  if (!text) return { question: null, why: null, options: [], recommendation: null };
  const lines = String(text).split('\n');
  let section = null;
  let question = null;
  let why = null;
  let recommendation = null;
  const options = [];
  let firstStrongLine = null;
  let firstLooseLine = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (firstLooseLine == null) firstLooseLine = line;
    const m = line.match(/^\*\*Q\s*\(#?\d*\)?\*\*\s*:\s*(.*)$/i);
    if (m) { question = m[1]; section = 'q'; continue; }
    const w = line.match(/^\*\*Pourquoi je demande\*\*\s*:\s*(.*)$/i) || line.match(/^###?\s+Why$/i);
    if (w) { why = w[1] ?? null; section = 'why'; continue; }
    if (/^(\*\*Options\*\*|###?\s+Options\b)/i.test(line)) { section = 'options'; continue; }
    const rec = line.match(/^\*\*Recommandation\s+Claude\*\*\s*:\s*(.*)$/i) || line.match(/^###?\s+Recommendation\b/i);
    if (rec) { recommendation = rec[1] ?? null; section = 'rec'; continue; }
    // strong heading like **Foo** at start of body becomes question fallback
    if (firstStrongLine == null && /^\*\*[^*]+\*\*/.test(line)) firstStrongLine = line.replace(/^\*\*([^*]+)\*\*\s*:?\s*/, '$1');
    if (section === 'options' && /^([-*]|[A-Z]\))\s+/.test(line)) {
      options.push(line.replace(/^([-*]|[A-Z]\))\s+/, (s) => s.trim().match(/^[A-Z]\)/) ? s : '').trim());
    } else if (section === 'q' && line && !line.startsWith('**')) {
      question = (question ? question + ' ' : '') + line;
    } else if (section === 'why' && line && !line.startsWith('**')) {
      why = (why ? why + ' ' : '') + line;
    } else if (section === 'rec' && line && !line.startsWith('**')) {
      recommendation = (recommendation ? recommendation + ' ' : '') + line;
    }
  }
  if (!question && firstStrongLine) question = firstStrongLine;
  if (!question && firstLooseLine) question = firstLooseLine.slice(0, 200);
  return { question, why, options, recommendation };
}

export function parseAnswerComment(commentBody) {
  if (!commentBody || !commentBody.startsWith(ANSWER_MARKER)) return null;
  const close = commentBody.indexOf('-->');
  if (close === -1) return null;
  const headerInner = commentBody.slice(ANSWER_MARKER.length, close);
  const m = headerInner.match(/qid\s*:\s*(\S+)/i);
  if (!m) return null;
  const text = commentBody.slice(close + 3).trim();
  return { qid: m[1], text };
}

export function buildQuestionBody({ qid, blockLevel, defaultIfNoAnswer, defaultDelayHours, taskIssue, question, why, options, recommendation, createdAt }) {
  const lines = [
    MARKER_OPEN,
    `qid: ${qid}`,
    `taskIssue: ${taskIssue}`,
    `blockLevel: ${blockLevel}`,
    'status: pending',
    `defaultIfNoAnswer: ${defaultIfNoAnswer ?? 'skip'}`,
    `defaultDelayHours: ${defaultDelayHours ?? 24}`,
    `createdAt: ${createdAt ?? new Date().toISOString()}`,
    '-->',
    '',
    `**Q (#${taskIssue})** : ${question}`,
    '',
    `**Pourquoi je demande** : ${why}`,
    '',
  ];
  if (Array.isArray(options) && options.length > 0) {
    lines.push('**Options**');
    for (const o of options) lines.push(`- ${o}`);
    lines.push('');
  }
  if (recommendation) {
    lines.push(`**Recommandation Claude** : ${recommendation}`);
    lines.push('');
  }
  lines.push(`**Impact si pas de réponse sous ${defaultDelayHours ?? 24}h** : applique défaut "${defaultIfNoAnswer ?? 'skip'}".`);
  return lines.join('\n');
}

function newQid(issueNumber, existing) {
  const taken = new Set(existing.map((q) => q.meta.qid));
  for (let i = 1; i < 1000; i++) {
    const id = `q-${issueNumber}-${String(i).padStart(3, '0')}`;
    if (!taken.has(id)) return id;
  }
  die('could not allocate qid (>999 questions on same issue?!)');
}

function fetchComments(issueNumber) {
  return ghJson(['api', `repos/{owner}/{repo}/issues/${issueNumber}/comments`, '--paginate']);
}

function listQuestionsOnIssue(issueNumber) {
  const comments = fetchComments(issueNumber);
  const out = [];
  for (const co of comments) {
    const q = parseQuestionComment(co.body || '');
    if (q) out.push({ ...q, commentId: co.id, htmlUrl: co.html_url, author: co.user?.login });
  }
  return out;
}

function listAnswersOnIssue(issueNumber) {
  const comments = fetchComments(issueNumber);
  const out = [];
  for (const co of comments) {
    const a = parseAnswerComment(co.body || '');
    if (a) out.push({ ...a, commentId: co.id, htmlUrl: co.html_url, author: co.user?.login, createdAt: co.created_at });
  }
  return out;
}

function fetchOpenIssueNumbers() {
  const j = ghJson(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number']);
  return j.map((x) => x.number);
}

function postComment(issueNumber, body) {
  const tmp = mkdtempSync(join(tmpdir(), 'q-'));
  const f = join(tmp, 'body.md');
  writeFileSync(f, body);
  const r = run('gh', ['issue', 'comment', String(issueNumber), '--body-file', f]);
  rmSync(tmp, { recursive: true, force: true });
  return { ok: r.code === 0, out: r.stdout, err: r.stderr };
}

function helpAndExit() {
  console.log(`Usage:
  task-questions list [--issue N]
  task-questions ask --issue N --question "<text>" --why "<text>" \\
                  [--options "A) opt|B) opt"] [--recommendation "<text>"] \\
                  [--block hard|soft|nice] [--default skip|continue|<letter>] \\
                  [--delay-hours 24] [--dry-run]
  task-questions read --qid <qid> [--issue N]
  task-questions answers [--issue N]
  task-questions resolve --qid <qid> --issue N --note "<text>" [--dry-run]
`);
  process.exit(0);
}

function getArg(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

function cmdList(args) {
  const issue = getArg(args, '--issue');
  const wantJson = args.includes('--json');
  const issues = issue ? [Number(issue)] : fetchOpenIssueNumbers();
  if (wantJson) {
    const items = [];
    for (const n of issues) {
      const qs = listQuestionsOnIssue(n);
      const ans = listAnswersOnIssue(n);
      const answeredQids = new Set(ans.map((a) => a.qid));
      for (const q of qs) {
        const payload = parseQuestionPayload(q.text);
        const qid = q.meta.qid || (q.commentId ? `q-${n}-c${q.commentId}` : `q-${n}-anon`);
        const status = q.meta.status || (answeredQids.has(qid) ? 'answered' : 'pending');
        items.push({
          id: qid,
          qid,
          issue: Number(q.meta.taskIssue ?? n),
          blockLevel: q.meta.blockLevel ?? null,
          status,
          createdAt: q.meta.createdAt ?? null,
          defaultIfNoAnswer: q.meta.defaultIfNoAnswer ?? null,
          defaultDelayHours: q.meta.defaultDelayHours ? Number(q.meta.defaultDelayHours) : null,
          text: q.text,
          question: payload.question,
          why: payload.why,
          options: payload.options,
          recommendation: payload.recommendation,
          githubUrl: q.htmlUrl,
          author: q.author ?? null,
          answers: ans.filter((a) => a.qid === q.meta.qid).map((a) => ({
            text: a.text,
            author: a.author ?? null,
            createdAt: a.createdAt ?? null,
            githubUrl: a.htmlUrl,
          })),
        });
      }
    }
    process.stdout.write(JSON.stringify({ items }, null, 2) + '\n');
    return;
  }
  let total = 0;
  for (const n of issues) {
    const qs = listQuestionsOnIssue(n);
    if (qs.length === 0) continue;
    console.log(c.bold(`\n#${n}`));
    for (const q of qs) {
      const status = q.meta.status === 'pending' ? c.yellow('pending') : c.green(q.meta.status || '?');
      console.log(`  ${status} ${q.meta.qid} (${q.meta.blockLevel}) — ${q.text.split('\n')[0].slice(0, 80)}`);
      console.log(c.dim(`    url: ${q.htmlUrl}`));
      total++;
    }
  }
  if (total === 0) console.log(c.dim('no questions found.'));
}

function cmdAsk(args) {
  const issue = Number(getArg(args, '--issue') ?? 0);
  const question = getArg(args, '--question');
  const why = getArg(args, '--why') ?? 'AC ambiguous or product decision needed.';
  const optionsRaw = getArg(args, '--options');
  const recommendation = getArg(args, '--recommendation');
  const blockLevel = (getArg(args, '--block') ?? 'soft').toLowerCase();
  const defaultIfNoAnswer = getArg(args, '--default') ?? 'skip';
  const defaultDelayHours = Number(getArg(args, '--delay-hours') ?? 24);
  const DRY = args.includes('--dry-run');

  if (!issue || !question) die('--issue and --question are required');
  if (!VALID_BLOCK.has(blockLevel)) die(`--block must be one of ${[...VALID_BLOCK].join('|')}`);

  const options = optionsRaw ? optionsRaw.split('|').map((s) => s.trim()).filter(Boolean) : [];
  const existing = listQuestionsOnIssue(issue);
  const qid = newQid(issue, existing);

  const body = buildQuestionBody({
    qid, blockLevel, defaultIfNoAnswer, defaultDelayHours,
    taskIssue: issue, question, why, options, recommendation,
  });

  if (DRY) {
    console.log(c.cyan(`DRY-RUN: would post the following comment on #${issue}:\n`));
    console.log(body);
    return;
  }
  const r = postComment(issue, body);
  if (!r.ok) die(`failed to post: ${r.err}`);
  console.log(c.green(`✓ question ${qid} posted on #${issue}`));
  console.log(c.dim(r.out.trim()));
}

function cmdRead(args) {
  const qid = getArg(args, '--qid');
  if (!qid) die('--qid required');
  const issue = getArg(args, '--issue');
  const issues = issue ? [Number(issue)] : fetchOpenIssueNumbers();
  for (const n of issues) {
    const qs = listQuestionsOnIssue(n);
    const found = qs.find((q) => q.meta.qid === qid);
    if (found) {
      const answers = listAnswersOnIssue(n).filter((a) => a.qid === qid);
      console.log(JSON.stringify({ issue: n, question: found, answers }, null, 2));
      return;
    }
  }
  die(`qid ${qid} not found`);
}

function cmdAnswers(args) {
  const issue = getArg(args, '--issue');
  const issues = issue ? [Number(issue)] : fetchOpenIssueNumbers();
  for (const n of issues) {
    const ans = listAnswersOnIssue(n);
    if (ans.length === 0) continue;
    console.log(c.bold(`\n#${n}`));
    for (const a of ans) {
      console.log(`  ${c.green('A')} ${a.qid} by ${a.author} (${a.createdAt})`);
      console.log(c.dim(`    ${a.text.split('\n')[0].slice(0, 100)}`));
      console.log(c.dim(`    url: ${a.htmlUrl}`));
    }
  }
}

function cmdAnswer(args) {
  const qid = getArg(args, '--qid') ?? getArg(args, '--id');
  const answer = getArg(args, '--answer');
  let issue = Number(getArg(args, '--issue') ?? 0);
  const DRY = args.includes('--dry-run');
  const wantJson = args.includes('--json');
  if (!qid || !answer) die('--qid (or --id) and --answer required');
  if (!issue) {
    const m = String(qid).match(/^q-(\d+)-/);
    if (!m) die('cannot derive issue from qid; pass --issue N');
    issue = Number(m[1]);
  }
  const body = `<!-- claude-answer qid: ${qid} -->\n\n${answer}`;
  if (DRY) {
    if (wantJson) process.stdout.write(JSON.stringify({ ok: true, dryRun: true, qid, issue, body }) + '\n');
    else { console.log(c.cyan('DRY-RUN: would post:')); console.log(body); }
    return;
  }
  const r = postComment(issue, body);
  if (!r.ok) {
    if (wantJson) { process.stdout.write(JSON.stringify({ ok: false, qid, issue, error: r.err.slice(0, 500) }) + '\n'); process.exit(1); }
    die(`failed to post answer: ${r.err}`);
  }
  // Best-effort resolution comment so cmdList can mark answered.
  const note = `Answer recorded for ${qid} via cockpit.`;
  postComment(issue, `<!-- claude-resolution qid: ${qid} -->\n\n${note}`);
  if (wantJson) process.stdout.write(JSON.stringify({ ok: true, qid, issue }) + '\n');
  else console.log(c.green(`✓ answer posted for ${qid} on #${issue}`));
}

function cmdResolve(args) {
  const qid = getArg(args, '--qid');
  const issue = Number(getArg(args, '--issue') ?? 0);
  const note = getArg(args, '--note') ?? 'Question resolved.';
  const DRY = args.includes('--dry-run');
  if (!qid || !issue) die('--qid and --issue required');

  const body = `<!-- claude-resolution qid: ${qid} -->\n\n${note}`;
  if (DRY) {
    console.log(c.cyan('DRY-RUN: would post:'));
    console.log(body);
    return;
  }
  const r = postComment(issue, body);
  if (!r.ok) die(`failed: ${r.err}`);
  console.log(c.green(`✓ resolution posted for ${qid} on #${issue}`));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') helpAndExit();
  const cmd = args[0];
  const rest = args.slice(1);
  if (cmd === 'list') cmdList(rest);
  else if (cmd === 'ask') cmdAsk(rest);
  else if (cmd === 'read') cmdRead(rest);
  else if (cmd === 'answers') cmdAnswers(rest);
  else if (cmd === 'resolve') cmdResolve(rest);
  else if (cmd === 'answer') cmdAnswer(rest);
  else die(`unknown command: ${cmd}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
