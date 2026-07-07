---
id: B-023
title: dead code and duplication cleanup
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Assorted dead code, leftovers and small duplications found in the 2026-07 audit. None is user-visible alone, but together they mislead readers and hide real gaps.

## Items
Status per item re-verified 2026-07-06:
- ~~**Dead config entries**~~ **done** — `react.showStartupSplash` gates the splash in `app.tsx`, `connection.githubScopes` feeds `github_auth_service` (F-031).
- ~~**Dead field `MarkdownFile.encoding`**~~ **done** — honored by GitHub `createBlob` and the local commit write path.
- **Re-export shims from old file moves** (still present): `app/src/data/github_storage_service.ts`, `app/src/data/local_git_storage_service.ts`, `app/src/auth/github_auth_service.ts`, `app/src/components/shell/running_agent_types.ts` are one-line re-exports → update importers and delete.
- **Duplicated test file** (still present): `local_git_storage_service.test.ts` exists in both `app/src/data/` and `app/src/services/` → keep the services copy.
- **Duplicated template literal** (still present): the `'# MD2\n\nProject design folder created by MD2.\n'` README template appears in `github_storage_service.ts` and in `desktop/local_git_service.js` → single shared constant per side (app: exported constant; desktop: module constant), or pass it from the app through the bridge.
- **`splitCards` double pass**: files are filtered and parsed in two passes in `markdown_parsing_service.ts` → parse once, partition by `isActive`.
- **Action reload debounce keeps one path**: `DataService.scheduleActionReload` remembers only the latest changed path, so two files changed within the 150 ms window report errors against the wrong file → collect a set of changed paths.
- **`void configRevision` re-render hack** in `ProjectWorkspace` → now tracked as its own bug, see [[B-031]].
- **Duplicated `agent_profiles` module** (new): `app/src/data/agent_profiles.ts` and `desktop/agent_profiles.js` are parallel implementations → see `J_002_refactor_large_modules.md` item 8.

The shims/duplicate-test/template items are folded into J-002 item 9 so they land with the refactor commits.

## acceptance criteria
- All listed items removed or properly implemented; imports updated; typecheck and both test suites stay green.
- No `/config` entry remains that has no behavioral effect (coordinated with F-031).
- `splitCards` parses each file exactly once (test asserts parse call count or equivalent behavior).

## see also
- `design\feature_descriptions\F_031_config_persistence.md`
- `design\architecture\architectural_decisions.md`
