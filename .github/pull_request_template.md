<!--
Title convention (keep the prefix from the issue): [backend|frontend|coord] <type>(<area>): <short imperative>
-->

## Closes

Closes #

## Summary

One paragraph. What changed and why — not what the diff contains.

## Acceptance criteria

<!-- Mirror the issue's AC checklist. Every box must be literally true before requesting review. -->

- [ ] …
- [ ] …

## Out of scope

<!-- Anything in the issue's Out-of-scope that a reviewer might otherwise expect. -->

## Test plan

<!-- Commands and manual steps. Paste relevant output if non-trivial. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build` (if backend or shared types changed)
- [ ] Manual check: …

## Risk and autonomy

<!-- Copy from the source issue. -->

- Risk: `risk:safe` | `risk:review-required` | `risk:destructive`
- Autonomy: `ai:autonomous` | `ai:human-checkpoint`

## Follow-ups

<!-- If the agent opened a delta at project-memory/backlog/issues.delta.json, note it here. -->

- Delta proposed: yes / no
- Decision: `AUTO-APPLIED` / `HOLD — <reason>`

## Project

<!-- Reviewer sanity check -->

- Owner: L / E / X
- Area: api / web / ci / memory / packages-types
- Priority: P0-now / P1-week / P2-soon / P3-backlog
