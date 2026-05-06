import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionComment, parseAnswerComment, buildQuestionBody } from './task-questions.mjs';

describe('parseQuestionComment', () => {
  it('returns null for non-question comment', () => {
    assert.equal(parseQuestionComment('hello'), null);
    assert.equal(parseQuestionComment(''), null);
    assert.equal(parseQuestionComment(null), null);
  });

  it('parses a well-formed question', () => {
    const body = [
      '<!-- claude-question v1',
      'qid: q-41-001',
      'taskIssue: 41',
      'blockLevel: soft',
      'status: pending',
      'defaultIfNoAnswer: skip',
      '-->',
      '',
      '**Q (#41)** : do X or Y?',
    ].join('\n');
    const q = parseQuestionComment(body);
    assert.equal(q.meta.qid, 'q-41-001');
    assert.equal(q.meta.blockLevel, 'soft');
    assert.equal(q.meta.status, 'pending');
    assert.match(q.text, /do X or Y/);
  });

  it('returns null when marker not at start', () => {
    const body = 'leading text\n<!-- claude-question v1\nqid: q-1\n-->\n';
    assert.equal(parseQuestionComment(body), null);
  });
});

describe('parseAnswerComment', () => {
  it('parses answer body', () => {
    const body = '<!-- claude-answer qid: q-41-001 -->\n\nGo with option B.';
    const a = parseAnswerComment(body);
    assert.equal(a.qid, 'q-41-001');
    assert.match(a.text, /option B/);
  });

  it('returns null when missing qid', () => {
    assert.equal(parseAnswerComment('<!-- claude-answer -->\nhi'), null);
  });

  it('returns null for non-answer comment', () => {
    assert.equal(parseAnswerComment('regular comment'), null);
  });
});

describe('buildQuestionBody', () => {
  it('round-trips through parseQuestionComment', () => {
    const body = buildQuestionBody({
      qid: 'q-41-001',
      taskIssue: 41,
      blockLevel: 'soft',
      defaultIfNoAnswer: 'skip',
      defaultDelayHours: 24,
      question: 'Settings or sidebar?',
      why: 'AC unspecified.',
      options: ['A) Settings', 'B) Sidebar'],
      recommendation: 'A.',
      createdAt: '2026-05-05T11:30:00Z',
    });
    const q = parseQuestionComment(body);
    assert.equal(q.meta.qid, 'q-41-001');
    assert.equal(q.meta.blockLevel, 'soft');
    assert.equal(q.meta.taskIssue, '41');
    assert.match(q.text, /Settings or sidebar/);
    assert.match(q.text, /Recommandation Claude/);
  });

  it('handles empty options gracefully', () => {
    const body = buildQuestionBody({
      qid: 'q-1-001',
      taskIssue: 1,
      blockLevel: 'hard',
      question: 'Q?',
      why: 'because',
    });
    const q = parseQuestionComment(body);
    assert.equal(q.meta.qid, 'q-1-001');
    assert.doesNotMatch(body, /\*\*Options\*\*/);
  });
});

import { parseQuestionPayload } from './task-questions.mjs';

describe('parseQuestionPayload', () => {
  it('extracts question, why, options, recommendation', () => {
    const text = [
      '**Q (#41)** : Should we ship X?',
      '',
      '**Pourquoi je demande** : impact on cache layer.',
      '',
      '**Options**',
      '- A) ship as is',
      '- B) defer to next sprint',
      '',
      '**Recommandation Claude** : option A',
      '',
    ].join('\n');
    const p = parseQuestionPayload(text);
    assert.match(p.question, /ship X/);
    assert.match(p.why, /cache layer/);
    assert.deepEqual(p.options, ['A) ship as is', 'B) defer to next sprint']);
    assert.match(p.recommendation, /option A/);
  });

  it('returns empty fields when text is empty', () => {
    const p = parseQuestionPayload('');
    assert.equal(p.question, null);
    assert.deepEqual(p.options, []);
    assert.equal(p.recommendation, null);
  });

  it('handles question without options or recommendation', () => {
    const p = parseQuestionPayload('**Q (#9)** : OK?\n\n**Pourquoi je demande** : safety.');
    assert.match(p.question, /OK\?/);
    assert.match(p.why, /safety/);
    assert.deepEqual(p.options, []);
    assert.equal(p.recommendation, null);
  });

  it('handles multi-line question body', () => {
    const text = '**Q (#1)** : line one\nline two';
    const p = parseQuestionPayload(text);
    assert.match(p.question, /line one/);
    assert.match(p.question, /line two/);
  });
});
