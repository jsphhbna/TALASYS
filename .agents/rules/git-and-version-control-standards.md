# Git and Version Control Standards

```
POLICY: Git and Version Control Standards
Version: 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ATOMIC COMMITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
One commit = one logical change. A commit should be independently revertable.

BAD: "fix stuff + add feature + update deps + typos"
GOOD (4 separate commits):
  "fix: correct off-by-one error in pagination slice"
  "feat: add export to CSV button on data table"
  "chore: upgrade eslint to 9.x"
  "docs: fix typo in CONTRIBUTING.md"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. CONVENTIONAL COMMIT FORMAT (Required)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Format: <type>(<scope>): <subject>

Types:
  feat:     New feature
  fix:      Bug fix
  docs:     Documentation only
  style:    Formatting, whitespace (no logic change)
  refactor: Code change that neither fixes a bug nor adds a feature
  perf:     Performance improvement
  test:     Adding or correcting tests
  chore:    Build process, tooling, dependency updates
  ci:       CI/CD configuration changes
  revert:   Reverting a previous commit

Subject rules:
  - Present tense, imperative: "add" not "adds" or "added"
  - Max 72 characters
  - No period at the end
  - Lowercase after the colon

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. BRANCH NAMING CONVENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pattern: <type>/<short-description>
  feat/user-auth-flow
  fix/invoice-total-calculation
  chore/upgrade-next-15
  docs/api-reference-update

Protected branches:
  main / master: production-ready only, never push directly
  develop / staging: integration branch, merged to main via PR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. FORBIDDEN OPERATIONS (Without Explicit Approval)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These commands require explicit user confirmation before execution:
  git push --force         (overwrites remote history)
  git reset --hard         (destroys local changes permanently)
  git rebase on a shared branch  (rewrites shared history)
  git clean -f             (deletes untracked files permanently)

Alternative to force push: git push --force-with-lease
  (fails if the remote has changes you haven't pulled — safer)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. PULL REQUEST STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every PR must include:
  - Title matching conventional commit format
  - Summary: what changed and why (1-3 bullets)
  - Test plan: how to verify the change works
  - Breaking changes section (if applicable)
  - Screenshot or demo (for UI changes)

PR size limit: if a PR changes more than 400 lines, split it.
Reviewers cannot meaningfully review large PRs and will rubber-stamp them.
```
