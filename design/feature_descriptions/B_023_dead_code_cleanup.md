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
- **Dead config entries**: `react.showStartupSplash` and `connection.githubScopes` are editable on `/config` but consumed by nothing → wire them up per F-031 or remove them.
- **Dead field**: `MarkdownFile.encoding` (`'utf-8' | 'base64'`) is declared but no writer honors it; GitHub `writeFile` always encodes text. Remove, or implement in the storage writers.
- **Re-export shims from old file moves**: `app/src/data/github_storage_service.ts`, `app/src/data/local_git_storage_service.ts`, `app/src/auth/github_auth_service.ts`, `app/src/components/shell/running_agent_types.ts` are one-line re-exports → update importers and delete.
- **Duplicated test file**: `local_git_storage_service.test.ts` exists in both `app/src/data/` and `app/src/services/` → keep the services copy.
- **Duplicated template literal**: the `'# MD2\n\nProject design folder created by MD2.\n'` README template appears in `github_storage_service.ts` and twice in `desktop/local_git_service.js` → single shared constant per side (app: exported constant; desktop: module constant), or pass it from the app through the bridge.
- **`splitCards` double pass**: files are filtered and parsed in two passes in `markdown_parsing_service.ts` → parse once, partition by `isActive`.
- **Action reload debounce keeps one path**: `DataService.scheduleActionReload` remembers only the latest changed path, so two files changed within the 150 ms window report errors against the wrong file → collect a set of changed paths.
- **`void configRevision` re-render hack** in `ProjectWorkspace` → replace with a proper subscription hook (`useSyncExternalStore` or a `useConfig()` hook per the architecture's hook+service pattern).

## acceptance criteria
- All listed items removed or properly implemented; imports updated; typecheck and both test suites stay green.
- No `/config` entry remains that has no behavioral effect (coordinated with F-031).
- `splitCards` parses each file exactly once (test asserts parse call count or equivalent behavior).

## see also
- `design\feature_descriptions\F_031_config_persistence.md`
- `design\architecture\architectural_decisions.md`
