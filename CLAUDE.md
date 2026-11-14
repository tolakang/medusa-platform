# medusa-platform: Builder Instructions

Six categories of Medusa v2 apps (ecommerce, pos, booking-services, wholesale, reseller, marketplace) in one pnpm workspace. Each category has its own backend and clients, each app its own Dockerfile and env, each business its own Dokploy project. Backends share one package, `packages/medusa-core`, in library mode (plan §4). The move to the shared core happens one category at a time (plan §5, TASKS SC-1, SC-2); an app not yet moved keeps its own setup. Words as in the plan's glossary (§2).

## Read before every task (in this order)
1. `BUILD_PLAN.md`: the requirements. **Frozen. Never edit it.** (`.claude/hooks/protect-build-plan.sh`, wired in `.claude/settings.json`, blocks Claude's file tools and shell writes on it, its checksum and the lock's own files; `scripts/guard.sh` checks the checksum and the lock in CI. Only the owner unlocks it for an approved revision, from their own terminal: `touch .claude/plan-unlocked`, then `rm .claude/plan-unlocked` to lock again (owner's how-to: `docs/PLAN_LOCK.md`). Never create, change or delete that switch file, and never ask a tool to.)
2. `docs/MEDUSA_SKILL.md`: the only allowed Medusa reference (verified for 2.22.6 in every app), with its evidence ladder in §0.
3. `docs/DEV_FLOW.md`: the mandatory cycle: research → implement → gates → evidence-based fix cycle → review → record → commit → push.
4. `docs/TASKS.md`: pick the next task, and tick it with evidence when done.
5. `<category>/README.md`: the category's Dokploy setup.

## Non-negotiable rules
- **No hallucination.** Every Medusa API, import, option, hook, step or CLI flag must be cited from `docs/MEDUSA_SKILL.md` or found via its evidence ladder (installed `.d.ts` → docs `.md` → official starters → release notes). No source means you don't use it.
- **Plan is frozen.** If evidence contradicts `BUILD_PLAN.md`, log it in `docs/TASKS.md` → *Findings log*. Scope or architecture changes wait for human approval.
- **Official extension points only** (plan §6.1). No forks, no `pnpm patch`, no `node_modules` edits, no `dist/` imports, no columns on core tables.
- **Exact pins.** All `@medusajs/*` packages are pinned to the same version (except `@medusajs/ui`); after a category's SC-1 PR the pins live in the root `pnpm-workspace.yaml` catalog and its apps write `"catalog:"`. `pnpm install --frozen-lockfile`.
- **Shared core** (plan §4). Only code that several backends really share goes into `packages/medusa-core`; code one app needs stays in that app. Clients never depend on it. It is used in library mode, never listed under `plugins` (that would switch every core feature on in every app). Moving a feature into the core is one PR, and every app using it must pass its tests in that PR. A move never changes a provider's identifier or id, a module key, a table or link name, or a migration file name (plan §4.4).
- **Skill check before every merge** (owner, 2026-10-15). After each task or phase, check the diff against the `medusa-v2` skill (`docs/MEDUSA_SKILL.md`) and update every related document before the PR is merged and pushed (DEV_FLOW §7.1).
- **Gates before commit.** DEV_FLOW Gates 1–5 green locally; CI green before merge. The fix cycle stops after 3 attempts without new evidence → mark the task Blocked and ask.
- **Git.** Branch per task; conventional commits scoped by category or `core` (`feat(booking): …`, `refactor(core): …`); never commit on or force-push `main`; never commit `.env` files. **Never push, create, move or delete a `release/*` branch:** production moves only when the owner does it (plan §8.1, D14). Other Claude sessions may share this checkout: check the branch before committing.

## Verify changes
```bash
cd <category>/<app> && pnpm install --frozen-lockfile && pnpm build && pnpm typecheck
```
Then run the rest of DEV_FLOW §5 (migrate on a fresh DB, health, tests, docker build, guardrails).
