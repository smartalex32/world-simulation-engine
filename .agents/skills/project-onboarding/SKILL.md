---
name: project-onboarding
description: Create or refresh AGENTS_PROJECT_REFERENCE.md from repository evidence when onboarding a project or adapting this agent template. Use for project guidance setup, not ordinary feature implementation.
---

# Project Onboarding

Produce a concise project reference that lets future agents find the right code
and run the right checks without rediscovering the repository.

## Gather evidence

- Read existing guidance, top-level layout, manifests, relevant entry points, and
  CI definitions. Inspect enough code to establish important boundaries.
- Resolve conflicting commands using maintained scripts and CI; label stale docs
  or unverified assumptions. Do not infer architecture from folder names alone.
- For an empty repository, record the intended purpose and unknowns; do not invent
  a stack or scaffold an application.

## Write the reference

Create or update `AGENTS_PROJECT_REFERENCE.md` with purpose and scope, stack and
setup, module map, critical invariants, exact validation commands and their working
directories, canonical links, and known limitations. Preserve valid project-specific
constraints. Replace template-maintenance restrictions only when the destination
is being adopted as an application project.

Keep general conduct in `AGENTS.md`; add a reference link there only if missing.
Record environment variable names and credential sources, never values. Separate
commands verified by execution from commands found but not run. Avoid running setup,
migrations, or external services solely to document them.

## Handoff

Check local paths and links. Return updated documents, important project facts,
verification performed, and unresolved setup questions. This workflow changes
guidance only unless the user also requests implementation or environment setup.
