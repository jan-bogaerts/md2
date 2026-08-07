---
author: 
id: F_135
internalId: db0d6a75-3aa8-49ef-b855-a0cd4253e25d
title: remove custom-prompt as hardcoded action
status: ready
owner: 
affects:
agents:
  - design/activity/card__db0d6a75-3aa8-49ef-b855-a0cd4253e25d.json#conversation=agent-ff4b6006-04c1-4bd3-aaa4-382a3177d7dd
  - design/activity/card__db0d6a75-3aa8-49ef-b855-a0cd4253e25d.json#conversation=agent-60d8666d-bbdd-4062-a2ea-4b8e638118c3
policy:
branch: f_135_remove_custom_prompt_as_hardcoded_action
worktree: 1
---
On the action popup, we currently  have 2 ways to use custom prompts:

* `custom prompt` button
* `+` button

this is too much. 'custom-prompt' should be renamed to '+'  and the '+' should be removed.

There is however a difference between the two: '+' shows an input dialog to provide a name for the new action. this input can also be removed. We will be adding a different way for adding actions from custom prompts soon, so the backend functions can remain.

## Current state

`md2.custom-prompt` is a shared built-in agent action. Its `Custom prompt` label makes it a normal action toggle in every supported popup. `ActionPopup` also owns a separate `Add action` (`+`) button. Clicking that button selects `md2.custom-prompt` and enables conversion mode: the popup shows a preset-name input, adds a `Save` button, and changes Send and keyboard submission from running the prompt to saving a reusable action before running it.

Both routes therefore start from the same custom-prompt action, but only the separate `+` route exposes prompt-to-action conversion. The renderer's conversion flow calls the existing action-definition writer and project persistence path. The built-in action's stable ID is also used by action execution and conversation continuation, so removing that built-in would break behavior unrelated to this UI duplication.

## implementation details

* Keep built-in action ID `md2.custom-prompt`, agent behavior, availability, and backend prompt-to-action conversion functions unchanged. Change its shared display label from `Custom prompt` to `+`; all consumers then use one canonical label.
* Render that built-in as an ordinary mutually exclusive action toggle. Give its `+` control an accessible custom-prompt name and tooltip so symbol meaning does not depend on sight or prior knowledge.
* Remove separate `Add action` icon button from `ActionSelector` and remove its `allowAdd`, `adding`, and `onAdd` interface.
* Remove popup conversion-mode state and handler. `ActionPopup` only owns selected action and height state; selecting `+` follows same selection path as every other action.
* Remove preset-name field and conditional save controls from popup content. Bottom row no longer shows `Save`, and Send or keyboard submission always runs current custom prompt without first creating an action file.
* Remove conversion-mode conditions from popup run validation. Empty custom prompts remain blocked by existing `md2.custom-prompt` validation.
* Keep action-definition writer, persistence bridge, and conversion helpers available for future custom-prompt action creation UI; this feature only removes their current popup entry point.
* Update shared-definition, popup, selector, prompt-shortcut, and bottom-row tests. Cover one visible `+` action, accessible naming, direct custom-prompt execution, absent preset-name and Save controls, and unchanged empty-prompt blocking.

## acceptance criteria

* Each supported action popup shows one custom-prompt entry, displayed as `+`; no separate `Add action` button exists.
* Assistive technology identifies `+` as custom prompt, and hover or focus explains its purpose.
* Selecting `+` opens normal custom-prompt controls without showing a preset-name input or `Save` button.
* Sending or keyboard-submitting non-empty text from `+` runs `md2.custom-prompt`; it does not create an action definition before or after the run.
* Empty custom prompts cannot run.
* Existing action definitions, run requests, conversation continuation, and histories keep stable action ID `md2.custom-prompt`.
* Existing backend prompt-to-action conversion and action-definition writing functions remain available and tested, although this popup no longer calls them.
