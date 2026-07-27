---
id: B-044
title: typecheck broken on main - missing MarkdownFile import in external card import tests
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 35d73e3f-c3a6-49fb-bf70-d4203b8d02e4
---

## Problem
`npm run typecheck` fails on main:

```
src/services/external_card_import_service.test.ts(8,28): error TS2304: Cannot find name 'MarkdownFile'.
```

The J-014 test split (commit 97feeb4) annotated the fixture array in `app/src/services/external_card_import_service.test.ts` with `MarkdownFile[]` without importing the type from `../data/data_types`. Tests still pass because vitest does not typecheck, so the break is invisible until someone runs `npm run typecheck` — which means the policy gate the repo relies on is currently red for every branch cut from main.

## Fix
Add `MarkdownFile` to the existing `../data/data_types` import in the test file (one line). Verify `npm run typecheck` is clean again.

## acceptance criteria
- `npm run typecheck` exits 0 on main.
- The external card import tests still pass.

## see also
- `design\feature_descriptions\ready\J_014_split_data_service_tests.md`
