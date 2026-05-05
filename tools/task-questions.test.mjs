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
