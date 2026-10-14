# DevKit V9 agent entrypoint (portable, advisory unless loaded by host)

For material development work, before editing: inspect existing project `BUILD_PLAN.md` and recovery bundle, reconcile recorded state with the actual repository, then automatically use `.agents/skills/build-plan-architect` and `.agents/skills/intent-skill-router` plus the minimum domain skills. The user should not need to name skills. Keep optional AI proposals PENDING until the user explicitly approves scope additions. Do not treat scope approval as authorization for destructive operations, production changes or active security testing.

See `.agents/rules/00-devkit-preflight.md` for full rules, and `scripts/v9_bootstrap_project.py`, `scripts/v9_recovery_audit.py`, and `scripts/v9_record_checkpoint.py` for recovery utilities. These scripts do not prove tests pass; verify the current revision and keep handoff state up to date. Do not place secrets in recovery documents.

Host agents must explicitly load/configure these instructions if they do not automatically recognize AGENTS.md or `.agents/rules/`.


**RC4 technical source baseline:** When routing into authentication, passwords, OAuth, JWT, CSRF, or mobile security, consult `v9/RC4_TECHNICAL_AUTHORITY_BASELINES.md` and apply its source-scope cautions; V8 skill text is protected and its sources must still be reviewed individually. Never confuse source mapping with verified project behavior.

## RC5 source decision override and limits
When Netlify Functions environment, Firebase Admin/Firestore Rules, GitHub `pull_request_target`, or JWT `alg` verification is relevant, consult `v9/RC5_PRIMARY_SOURCE_DECISIONS.md` and its exact official section before assuming legacy examples apply. This is a scoped overlay, never a blanket assertion that the whole skillpack or the current project implementation have passed claim-level verification.


## RC6 upgraded original-skill source governance
The user authorized edits to the 600 inherited V8 skills. Use the current per-skill `references/SOURCE_MAP.md` RC6 claim/source trace, and prefer `SKILL.md` RC6 source-section-reviewed decisions whenever applicable. Do not interpret URL routing as independent claim verification. Original V8 digests remain archived in `v9/legacy_skill_digests.json`; current upgraded hashes live in `v9/rc6_legacy_upgraded_digests.json`. User performs real host/mobile/AppSec tests.

## RC10 outcome and reference discovery
For informal product builds, use `intent-skill-router` or the read-only `scripts/v9_route_skills.py`; fall back to `v9/RC10_DISCOVERY_CATALOG.json` without Python. Read selected skills and necessary references. Automatically assess UX/UI/HCI laws, reflow, accessibility, typography, states, motion/performance, public SEO/GEO, security/privacy, owned endpoints, rate limits and persistence. Read applicability decisions; add backend/database/platform specialists when features or actual code require them. Record inapplicable boundaries; preserve small scope for atomic edits and discussion for quoted ideas. Routing is not optional-feature approval, active-test authorization or live-host evidence. Inspect actual code/full catalog when a cue is missed.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
