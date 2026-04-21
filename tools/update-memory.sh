#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEM="$ROOT/project-memory"
AUTO="$MEM/auto"
mkdir -p "$AUTO"

DATE="$(date +%Y-%m-%d)"

# 1. Repo tree snapshot (apps + packages + docs), excluding node_modules/dist/.next/.turbo.
{
  echo "# auto/tree.md"
  echo
  echo "Generated: $DATE. Do not edit by hand."
  echo
  echo '```'
  (
    cd "$ROOT"
    find apps packages docs project-memory tools .github \
      -type d \( -name node_modules -o -name dist -o -name .next -o -name .turbo -o -name tsconfig.tsbuildinfo \) -prune -o \
      -type f -print 2>/dev/null | sort
  )
  echo '```'
} > "$AUTO/tree.md"

# 2. Append last 10 commits to 08-recent-changes.md under a new date heading if not already present today.
CHANGES="$MEM/08-recent-changes.md"
HEADING="## $DATE (auto)"

if ! grep -qF "$HEADING" "$CHANGES" 2>/dev/null; then
  {
    echo ""
    echo "$HEADING"
    echo ""
    git -C "$ROOT" log --pretty=format:"- %h %s" -10
    echo ""
  } >> "$CHANGES"
fi

# 3. Route map snapshot from apps/api/src/routes/index.ts (best-effort).
ROUTES_SRC="$ROOT/apps/api/src/routes/index.ts"
if [ -f "$ROUTES_SRC" ]; then
  {
    echo "# auto/routes.md"
    echo
    echo "Generated: $DATE from apps/api/src/routes/index.ts"
    echo
    echo '```ts'
    cat "$ROUTES_SRC"
    echo '```'
  } > "$AUTO/routes.md"
fi

# 4. Pages snapshot for web.
{
  echo "# auto/web-pages.md"
  echo
  echo "Generated: $DATE"
  echo
  echo '```'
  (
    cd "$ROOT"
    find apps/web/src/app -name 'page.tsx' -o -name 'layout.tsx' 2>/dev/null | sort
  )
  echo '```'
} > "$AUTO/web-pages.md"

echo "project-memory refreshed at $DATE"
echo "  - $AUTO/tree.md"
echo "  - $AUTO/routes.md"
echo "  - $AUTO/web-pages.md"
echo "  - $CHANGES (date heading ensured)"
