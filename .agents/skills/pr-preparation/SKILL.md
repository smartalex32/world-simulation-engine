---
name: pr-preparation
description: Prepare a reviewable pull request title, description, and validation summary from completed changes. Use when asked to prepare a PR or summarize a branch for review; publication follows the user's requested scope.
---

# PR Preparation

Turn the final change into a reviewable title and description grounded in the
actual diff and available validation evidence.

## Establish the comparison

- Inspect repository status and the requested branch or change range. For a branch
  PR, determine the base from repository or existing PR metadata; do not assume
  `main`. Use the merge base to inspect branch changes.
- Distinguish committed changes from staged, unstaged, and untracked work. Explain
  relevant changes that would be absent from the proposed PR.
- If the base cannot be established, prepare a clearly labeled working-tree
  summary and ask for the base only when needed to complete the PR comparison.

## Prepare the handoff

Read the complete scoped diff and applicable PR template. Lead with the concrete
problem and resulting behavior. Include a trigger and before/after example when
helpful, then material implementation decisions, validation, and known limitations.
Write for a reviewer who has not seen the conversation. Exclude abandoned attempts
unless they explain a relevant technical tradeoff.

Reuse test evidence only if it applies to the final code. Otherwise run proportional
checks or mark them unrun. Identify blockers without silently expanding a writing
request into code changes. Never present failed or unrun checks as passing.

## Delivery and publication

Return the title and body directly unless the user requests a file or an external PR.
Preparing text alone does not authorize commits, pushes, or publication. When the
user requests publication and prerequisites are satisfied, use the available
repository integration or CLI within that authorization. Preserve actual newlines
through structured arguments or a body file. After an ambiguous creation response,
inspect existing PRs before retrying to avoid duplicates.
