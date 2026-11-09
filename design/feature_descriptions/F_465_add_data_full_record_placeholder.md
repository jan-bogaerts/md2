---
author: 
id: F_465
internalId: 57c8f8e6-a9fa-4e24-b262-ccacc65cb570
title: add data - full record placeholder
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__57c8f8e6-a9fa-4e24-b262-ccacc65cb570.json
policy:
branch: f_465_add_data_full_record_placeholder
worktree: 1
---

We already have support for the `{{ data path}}` placeholder (added space to prevent placeholder to be applied). This version selects a specific field value of the currently active record.

We should also support the placeholder `{{ data }}` , so with no path. This should insert the entire json records (stringified, pretty printed)

## Current state

A for-each record is the one item of the for-each JSON that the current loop iteration processes.

`resolveDataPlaceholders` in `shared/action_for_each.mjs` replaces `{{data path}}` with a value from that record. Its pattern requires a path, so `{{data}}` does not match and reaches the agent as literal text.

`resolveRecordPlaceholders` in `desktop/src/actions/action/action_text.js` runs after the named placeholders. When no record exists, it throws `Cannot resolve data placeholder without a for-each record` for the path form. That check also requires a path. No record exists for command actions, prompt preparation in `action_runner_service.js`, or prompts sent to an already active agent through `ActionRun.resolveActiveAgentPrompt`.

`ACTION_PROMPT_PLACEHOLDERS` in `app/src/data/action_placeholders.ts` has one `data` entry. The toolbar and the `{{` typeahead insert `{{data path}}` from it, and the typeahead then selects the word `path`. The placeholder `name` only identifies the menu entry. Action files store the inserted template text, so renaming an entry changes no saved data.

## implementation details

- In `shared/action_for_each.mjs`, make the path optional and require its first character to be non-whitespace: `/\{\{\s*data(?:\s+([^{}\s][^{}]*?))?\s*\}\}/gu`. Without that first-character rule, `{{data   }}` would capture whitespace as a path and fail. `{{database}}` and `{{data-x}}` must stay unmatched.
- In `resolveDataPlaceholders`, return `JSON.stringify(record, null, FULL_RECORD_JSON_INDENT)` when the path capture is `undefined`, with `FULL_RECORD_JSON_INDENT = 2`. Every record type uses this JSON form, so a string record is inserted with its JSON quotes. The raw-string rule stays only for `{{data path}}`.
- In `action_text.js`, change the no-record check to `/\{\{\s*data(?:\s[^{}]*)?\}\}/u`, so `{{data}}` fails with the existing error wherever `{{data path}}` already fails. Do not add `data` to `PLACEHOLDER_NAMES`.
- `resolveDataPlaceholders` has one caller, `resolveRecordPlaceholders`. All callers of `resolvePlaceholders`, `resolveAgentPrompt`, and `resolvePopupPrompt` receive the new behavior, and none needs a mode flag.
- In `action_placeholders.ts`, add the name `data-path` and keep the existing description on it. Change `data` to mean the full record, with the description `Complete current for-each record as pretty-printed JSON.`, and list it directly before `data-path`. `formatActionPlaceholder` applies the `{{data path}}` special case to `data-path`, so `data` uses the default `{{data}}` format.
- In `markdown_placeholder_typeahead_plugin.tsx`, apply the `select(7, 11)` path selection to `data-path` only. Selecting `data` places the caret at the end.
- Replacement stays in the `String.replace` callback, so `$` sequences and placeholder-like text inside the record are inserted literally and are not resolved again.
- Tests:
  - `action_for_each.test.mjs`: full record pretty-printing, whitespace forms, array and primitive records, `{{data}}` mixed with `{{data path}}`, literal record content, and unmatched `{{database}}`.
  - `action_text.test.mjs`: `{{data}}` resolves with a record and throws the existing error without one.
  - `markdown_placeholder_toolbar_control.grouped.test.tsx`: both entries insert their own text.
  - `markdown_placeholder_typeahead_plugin.real.test.tsx`: `{{data path}}` selects `path`, and `{{data}}` leaves the caret at the end.

## acceptance criteria

- `{{data}}` and `{{ data }}` in a for-each run are replaced with the whole current record as JSON indented by two spaces.
- Object, array, string, number, boolean, and `null` records all insert their JSON form. A string record keeps its JSON quotes.
- `{{data path}}` output, including raw strings and compact JSON for objects and arrays, is unchanged. Missing paths still fail that record.
- A prompt can combine `{{data}}` and `{{data path}}`, and each iteration uses its own record.
- Placeholder-like text and `$` sequences inside the record appear literally in the prompt.
- `{{data}}` without a for-each record fails with `Cannot resolve data placeholder without a for-each record`, including in command actions.
- `{{database}}` and other names that only start with `data` are not treated as data placeholders.
- The placeholder toolbar and the `{{` typeahead offer both `{{data}}` and `{{data path}}`, each with its own description.
- Choosing `{{data path}}` from the typeahead selects the word `path`. Choosing `{{data}}` leaves the caret after the placeholder.