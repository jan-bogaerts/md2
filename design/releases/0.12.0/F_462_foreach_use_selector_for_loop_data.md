---
author: 
id: F_462
internalId: 9ee3f856-14a9-495a-88f7-a06cca186ac6
title: foreach use selector for loop data
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__9ee3f856-14a9-495a-88f7-a06cca186ac6.json
policy:
changedFiles:
  - app/src/components/actions/run/popup/action_for_each_menu.test.tsx
  - app/src/components/actions/run/popup/action_for_each_menu.tsx
  - app/src/components/actions/run/popup/action_for_each_setup_dialog.test.tsx
  - app/src/components/actions/run/popup/action_for_each_setup_dialog.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.test.tsx
  - app/src/data/action_run_types.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/src/actions/action/action_for_each.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_run_request.test.mjs
  - shared/action_for_each.d.mts
  - shared/action_for_each.mjs
after: a7d96183-9b8a-4c2e-a51a-925f7ca9aded
---

We recently added support for the `for-each` feature, which lets the engine perform a prompt over a series of data records. So, for each record in the list, a prompt is run.

We can currently only select a json file. the system will open it, if it is a list, it will loop over every item, if it is an object, it will only run the prompt 1 time with the record as input.

We need to improve processing of json files that contain a root object. When the user adds the json file as a for-each value, and it is an object, then the user can enter a field selector (like is used for the `{{ data path}}` placeholder.  This way, the user can still select an array that should be used as the loop data.

Also, in the context menu of the 'for-each' button on the action-popup, we currently show 'at end' and 'on failure' menu items. this should be improved. instead of these 2 menu items, use a single menu item 'setup' where user can specify:

* at end
* on failure
* path to list data, if an object

## Current state

`ActionForEachConfig` stores the selected JSON value, file name, end mode, and failure policy. Draft settings live in `ActionRunInputStore`; settings on an existing conversation are persisted in its activity file. The shared validator rejects unknown configuration fields.

At execution, `forEachRecords` treats a root array as ordered loop records and every other JSON value as one record. A root object therefore runs once, even when it contains the intended record array.

`{{data path}}` placeholders already resolve dot-separated object keys and numeric array indexes, such as `countries.0.cities`. Missing segments fail with a clear data-path error. The for-each button menu currently provides `View`, `Remove`, `At end`, and `On failure`; the last two open separate submenus.

## implementation details

- Add optional `dataPath` to `ActionForEachConfig`. `dataPath` is a dot-separated selector into the attached root object; numeric segments select array indexes. Extend shared validation, TypeScript declarations, activity persistence, and run-request validation to retain it. Existing configurations without `dataPath` keep current behavior.
- Reuse the existing data-path resolver. Before the first loop turn, resolve `dataPath` against the root JSON value and require the selected value to be an array. Report a missing path or non-array result as a configuration error; do not start any record.
- Keep a root array directly iterable. For a root object, an empty selector keeps the object as one record; a configured selector makes the selected array the ordered loop records.
- Replace `At end` and `On failure` in `ActionForEachMenu` with one `Setup` item. `View` and `Remove` remain unchanged.
- Open a for-each setup dialog containing `At end`, `On failure`, and, only for a root object, `Path to list data`. Stage edits locally; `Cancel` discards them and `Save` persists one complete configuration through the existing draft or conversation path. Disable changes while the loop is active.
- Validate the selector in the setup dialog before saving so an invalid or non-array path is shown through `dialogService`. Backend validation remains authoritative for restored or externally supplied configurations.
- Add focused tests for setup save/cancel and root-dependent field visibility; configuration persistence and validation; nested selectors, numeric indexes, missing paths, and non-array results; root arrays, blank selectors, empty selected arrays, and failure before any agent turn.

## acceptance criteria

- For-each setup is available through one `Setup` menu item and allows the user to configure end behavior, failure behavior, and a loop-data path for root-object JSON.
- A dot-separated path selecting an array inside a root object runs one prompt per selected array item, in array order.
- Numeric path segments can traverse arrays inside the selected path.
- Missing paths and paths resolving to non-arrays show a clear error and start no loop records.
- Empty selected arrays complete without an agent turn. Root arrays and root objects without a selector retain current behavior.
- Saved setup is retained for draft runs and persisted conversations, including after reopening the conversation.
- `View`, `Remove`, running-loop locking, end modes, failure policies, and `{{data path}}` placeholder behavior remain unchanged.
