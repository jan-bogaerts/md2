---
id: B_265
internalId: 2a81b19c-14fc-49d9-98c1-f7101fcd8e14
title: UI tests hit the Windows open-file limit while loading icons
status: ready
agents:
  - design/activity/card__2a81b19c-14fc-49d9-98c1-f7101fcd8e14.json
changedFiles:
  - app/src/App.test.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/editor/source/markdown_source_undo_redo.tsx
---

## Problem

UI test runs intermittently fail during dependency loading with `EMFILE: too many open files`, often naming an unrelated file under `app/node_modules/@mui/icons-material/`. Agents summarize this as "The grouped UI test runner hit Windows' open-file limit."

Recorded failures affect `actions_no_mock.test.tsx`, `App.test.tsx`, and `action_popup.test.tsx`, including runs with only one test file selected. Suites fail before executing tests. Splitting runs or reducing test-worker concurrency does not reliably prevent the failure.

## Evidence and likely cause

`app/src/components/editor/source/markdown_source_undo_redo.tsx` imports `{ Redo, Undo }` from the root `@mui/icons-material` package. Its installed version, 9.2.0, has an index re-exporting **10,750 icon modules**. This barrel import exposes the entire icon catalogue to dependency loading despite using only two icons. [MUI recommends individual imports to avoid barrel-import overhead](https://mui.com/material-ui/guides/minimizing-bundle-size/).

The import is reached through `MarkdownFormatToolbarControls` and the shared `MarkdownEditor`, including action prompt editors. It is a static import even when Source mode is inactive. Most other application icon imports already use individual module paths.

The actions wrapper imports **21 grouped test files**; the UI project in `app/vite.config.ts` allows **2 workers**. These are separate from the 10,750 icon dependencies. The logs do not measure simultaneous open files or establish the runtime's exact descriptor limit. The barrel import is the leading suspected cause; an isolated before/after run is still needed to confirm it.

`App.test.tsx` and `action_popup.test.tsx` already mock the root icon package and import Redo/Undo directly as a workaround. The UI setup also loads the actual MDXEditor package before applying its stub, adding dependency work.

## Proposed solution

Replace the production barrel import in `markdown_source_undo_redo.tsx` with:

```ts
import Redo from '@mui/icons-material/Redo';
import Undo from '@mui/icons-material/Undo';
```

Keep Source undo/redo behavior, grouped test organization, and worker settings unchanged. Review the two root-package mocks after the production change; remove them if they only work around this import and the targeted tests pass without them. Do not change the MDXEditor setup as part of this fix unless the remaining failure is traced to it.

The affected toolbar and all shared editor consumers require the same icons and behavior. No service contracts, persistence formats, or desktop code need changes. Individual imports should also reduce development loading work without changing rendered icons.

## Validation

- On Windows, run `actions_no_mock.test.tsx` independently before and after the import change, then run it together with `App.test.tsx` and `action_popup.test.tsx`. Verify suites reach and complete their tests without `EMFILE`.
- Run existing focused Source undo/redo coverage to verify the buttons still invoke the Source controller and reflect undo/redo availability.
- Run the app linter. Use targeted test runs only; do not run the full suite for this fix.
- If `EMFILE` remains, measure concurrent file opens and trace the remaining dependency graph before proposing broader runner changes.

No implementation change is included in this report.
