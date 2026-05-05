// Groups consecutive identical lines into "<line> ×N" so repeated errors don't flood.
// Pure: takes [lines], returns [{ line, count, isError }].

const ERROR_RE = /\b(error|fail|failed|exception|stack|EACCES|ENOENT|ECONN|panic)\b/i;

export function isErrorLine(s) {
  return ERROR_RE.test(String(s ?? ""));
}

export function groupLines(lines) {
  const out = [];
  for (const raw of lines) {
    const line = String(raw ?? "");
    const last = out[out.length - 1];
    if (last && last.line === line) {
      last.count += 1;
    } else {
      out.push({ line, count: 1, isError: isErrorLine(line) });
    }
  }
  return out;
}

export function formatGrouped(groups) {
  return groups.map((g) => g.count > 1 ? `${g.line}  ×${g.count}` : g.line).join("\n");
}
