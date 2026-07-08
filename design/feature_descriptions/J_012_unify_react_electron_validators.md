---
id: J-012
title: unify duplicated React/Electron validators (agent profiles, action definitions)
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Two formats are validated by parallel, hand-synced implementations on both sides of the process boundary:

- **Agent profiles**: `app/src/data/agent_profiles.ts` (TypeScript) and `desktop/agent_profiles.js` (CommonJS) — already flagged in B-023/J-002 item 8, still duplicated.
- **Action definitions**: `app/src/services/action_definition_loader.ts` and `desktop/action_definitions.js` re-implement the same rules (required fields, type whitelist, sub-action refs, cycle detection).

Divergence has real consequences: a definition the React loader accepts but the desktop scheduler rejects fails only at scheduled-run time, with no UI warning; a profile shape accepted by one side and not the other breaks agent selection depending on where it is read. Every rule change must be made twice and can silently drift.

## Fix
Pick one of two strategies and apply it to both formats:
1. **Shared module (preferred)**: create a dependency-free shared package/folder (e.g. `shared/` with plain `.js` + `.d.ts`, or a TS source compiled to CJS in the desktop build step) containing the validation/normalization logic; both `app` and `desktop` import it. The desktop currently has no build step, so plain JS with type declarations consumed by the app is the low-friction option.
2. **Single-side validation**: make the desktop authoritative and have the React side call it through the bridge (works when connected, but web-only GitHub mode still needs local validation — which is why option 1 is preferred).

Also add a contract test: one fixture set of valid/invalid profiles and action files asserted against both loaders until the duplication is actually gone.

## acceptance criteria
- Exactly one implementation of profile validation and one of action-definition validation exists (or a contract test proves behavioral equality as an interim step).
- Both test suites green; scheduler and React loader accept/reject the same fixture set.
- J-002 item 8 and the B-023 duplication entry are marked resolved by this job.

## see also
- `design\feature_descriptions\B_023_dead_code_cleanup.md`
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\ready\F_033_agent_and_model_selection.md`
