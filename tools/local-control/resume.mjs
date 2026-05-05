export function evaluateResume({ run, questions = [] }) {
  if (!run) return { canResume: false, reason: 'no run found to resume' };
  if (run.status === 'running') return { canResume: false, reason: 'run is still active' };
  const pending = questions.filter((q) => q && q.status !== 'answered');
  const answered = questions.filter((q) => q && q.status === 'answered');
  if (run.waitingOnQuestion) {
    const matched = answered.find((q) => q.id === run.waitingOnQuestion);
    if (!matched) {
      return {
        canResume: false,
        reason: `waiting on question ${run.waitingOnQuestion} — not yet answered`,
        pendingQuestions: pending.length,
      };
    }
    return {
      canResume: true,
      reason: null,
      runId: run.id,
      issue: run.issue ?? null,
      mode: run.mode ?? 'plan',
      answeredQuestionId: matched.id,
    };
  }
  if (pending.length > 0) {
    return { canResume: false, reason: `${pending.length} pending question(s) — answer first or pick a different run` };
  }
  return { canResume: true, reason: null, runId: run.id, issue: run.issue ?? null, mode: run.mode ?? 'plan' };
}
