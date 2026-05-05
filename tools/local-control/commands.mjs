// commands.mjs — strict whitelist of commands the local-control server may run.
// Each entry defines: bin, fixedArgs (always passed), argSpec (extra args constraints),
// kind (logical category), and a stable name.

const PNPM = 'pnpm';
const GIT  = 'git';

export const COMMANDS = Object.freeze({
  'task:doctor':         { bin: PNPM, fixedArgs: ['task:doctor'],            kind: 'command', extraArgs: 'none' },
  'task:score':          { bin: PNPM, fixedArgs: ['task:score', '--top', '10'], kind: 'command', extraArgs: 'none' },
  'task:queue':          { bin: PNPM, fixedArgs: ['task:queue'],             kind: 'command', extraArgs: 'none' },
  'task:deps':           { bin: PNPM, fixedArgs: ['task:deps'],              kind: 'command', extraArgs: 'none' },
  'task:next':           { bin: PNPM, fixedArgs: ['task:next'],              kind: 'command', extraArgs: 'none' },
  'task:stale':          { bin: PNPM, fixedArgs: ['task:stale'],             kind: 'command', extraArgs: 'none' },
  'task:guard':          { bin: PNPM, fixedArgs: ['task:guard'],             kind: 'command', extraArgs: 'none' },
  'task:run:plan':       { bin: PNPM, fixedArgs: ['task:run', '--plan-only'],kind: 'plan',    extraArgs: 'issue' },
  'task:questions:list': { bin: PNPM, fixedArgs: ['task:questions', 'list'], kind: 'command', extraArgs: 'none' },
  'git:status':          { bin: GIT,  fixedArgs: ['status', '--short'],      kind: 'command', extraArgs: 'none' },
  'git:branch':          { bin: GIT,  fixedArgs: ['branch', '--show-current'],kind:'command', extraArgs: 'none' },
  'git:pull':            { bin: GIT,  fixedArgs: ['pull', '--ff-only'],      kind: 'command', extraArgs: 'none' },
});

const ISSUE_FLAG_RE = /^--issue=(\d{1,6})$/;
const ISSUE_NUM_RE  = /^\d{1,6}$/;

export function resolveCommand(name, extraArgs = []) {
  const entry = COMMANDS[name];
  if (!entry) return { error: `command not whitelisted: ${name}` };
  const safe = [];
  if (entry.extraArgs === 'none') {
    if (extraArgs.length) return { error: `command ${name} accepts no extra args` };
  } else if (entry.extraArgs === 'issue') {
    let issue = null;
    for (const a of extraArgs) {
      if (typeof a !== 'string') return { error: 'all args must be strings' };
      const m = a.match(ISSUE_FLAG_RE);
      if (m) { issue = Number(m[1]); continue; }
      if (ISSUE_NUM_RE.test(a)) { issue = Number(a); continue; }
      return { error: `arg not allowed: ${a}` };
    }
    if (issue == null) return { error: `command ${name} requires --issue=<n>` };
    safe.push(`--issue=${issue}`);
  }
  return {
    bin: entry.bin,
    args: [...entry.fixedArgs, ...safe],
    kind: entry.kind,
    name,
  };
}

export function listCommands() {
  return Object.keys(COMMANDS);
}
