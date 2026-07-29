---
id: F-1
title: prompts vs actions folder inconsistency
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: b8c1f8ef-aeef-4576-be42-f6c6d0757728
after: 23b4fb40-df7b-4ed7-916d-a4e1da0416ac
---

## Problem
The design (F-003, `data management.md`) names the special folder for actions `prompts`, holding markdown-defined actions and/or json definitions that may reference prompt files. The implementation loads json-only definitions from a separate `actions` folder (`DEFAULT_ACTIONS_FOLDER = 'actions'`), while `DEFAULT_SPECIAL_FOLDERS` in `file_tree.ts` still lists `prompts` as special for tree/search display. Result: two folder concepts, markdown-defined actions unsupported, and json actions cannot reference an external prompt file.

## Fix
- Decide the canonical folder name (recommend keeping `actions` since projects may already use it) and make the special-folders list and the actions folder config consistent — the actions folder should be marked special in the tree.
- Support the design's prompt-file indirection: allow a json action to specify `textFile` (path to a markdown prompt with `{{placeholders}}`) instead of inline `text`; the loader reads it through storage and validates existence.
- Optionally support markdown-defined actions (header configures name/type/appliesTo, body is the prompt) if still wanted; otherwise update `design\feature_descriptions\F_003_special_folders.md` to drop the md-action variant so docs match reality.
- Special-folder names should come from config, not the hardcoded `DEFAULT_SPECIAL_FOLDERS` (F-003: "Names should be configurable").

## acceptance criteria
- The configured actions folder appears as a special folder in the tree.
- A json action with `textFile` resolves its prompt content at load/run time; missing files fail validation clearly.
- Special-folder names are configurable with the current defaults.
- Docs and implementation agree on the folder model.
- Tests cover textFile resolution, missing-file validation and configurable special folders.

## see also
- `design\feature_descriptions\F_003_special_folders.md`
- `design\feature_descriptions\F_010a_action_model_and_loading.md`
