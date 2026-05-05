import { spawnSync } from 'node:child_process';

export function runDoctorJson(repoRoot) {
  const r = spawnSync('node', ['tools/task-doctor.mjs', '--json'], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0 && r.status !== 1) {
    return { ok: false, reason: r.stderr || `doctor exit ${r.status}`, raw: r.stdout };
  }
  try {
    const parsed = JSON.parse(r.stdout);
    return { ok: true, report: parsed };
  } catch (e) {
    return { ok: false, reason: `parse error: ${e.message}`, raw: r.stdout };
  }
}

export function summarizeDoctor(report) {
  if (!report) return null;
  const local = report.local ?? {};
  const gh = report.github ?? {};
  const rt = report.runtime ?? {};
  const gates = report.gates ?? {};
  const blockers = [];
  for (const [phase, gate] of Object.entries(gates)) {
    if (!gate?.ready) for (const b of (gate.blockers ?? [])) blockers.push({ phase, blocker: b });
  }
  const branch = local.git?.branch ?? null;
  const dirtyCount = local.git?.dirtyCount ?? 0;
  const ahead = local.git?.ahead ?? 0;
  const phaseSummary = {
    phase1: { ready: true, blockers: [] },
    phase2: gates.phase2 ?? { ready: false, blockers: [] },
    phase3: gates.phase3 ?? { ready: false, blockers: [] },
    phase4: gates.phase4 ?? { ready: false, blockers: [] },
  };
  const checks = [
    { id: 'scripts', label: 'Scripts locaux', status: local.scripts?.status, detail: local.scripts?.detail },
    { id: 'pkg', label: 'package.json', status: local.packageScripts?.status, detail: local.packageScripts?.detail },
    { id: 'docs', label: 'Ops docs', status: local.docs?.status, detail: local.docs?.detail },
    { id: 'git', label: 'Branche', status: dirtyCount === 0 ? 'ok' : 'warn',
      detail: `${branch ?? '?'} (${dirtyCount} dirty, ${ahead} ahead)` },
    { id: 'gh', label: 'gh auth', status: gh.auth?.status, detail: gh.auth?.detail },
    { id: 'protection', label: 'Main protection', status: gh.branchProtection?.status, detail: gh.branchProtection?.detail },
    { id: 'meta', label: 'Issue task-meta', status: gh.openIssuesMeta?.status, detail: gh.openIssuesMeta?.detail },
    { id: 'questions', label: 'Questions humaines', status: gh.pendingQuestions?.status, detail: gh.pendingQuestions?.detail },
    { id: 'guard', label: 'Task guard', status: rt.guard?.status, detail: rt.guard?.detail },
  ];
  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');
  const ok = failed.length === 0;
  const recommendations = [];
  if (phaseSummary.phase2.ready && phaseSummary.phase3.ready) recommendations.push('Phase 3 prête. Configure Notion + n8n + WhatsApp pour activer les notifications.');
  else if (phaseSummary.phase2.ready) recommendations.push('Phase 2 ouverte. Lance `pnpm task:next` puis `pnpm task:run -- --plan-only`.');
  if (failed.length) recommendations.push(`${failed.length} check(s) en échec — voir détails ci-dessous.`);
  if (warned.length && !failed.length) recommendations.push(`${warned.length} avertissement(s) à examiner.`);
  return {
    ok,
    branch,
    dirtyCount,
    ahead,
    checks,
    failed: failed.map((c) => c.label),
    warned: warned.map((c) => c.label),
    phaseSummary,
    blockers,
    recommendations,
    generatedAt: report.generatedAt ?? new Date().toISOString(),
  };
}
