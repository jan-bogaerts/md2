---
author: 
id: F_458
internalId: c9a462cf-7874-4ada-a2f3-df08cf1793b2
title: add for-each feature
status: ready
owner: 
affects:
agents:
  - design/activity/card__c9a462cf-7874-4ada-a2f3-df08cf1793b2.json
policy:
after: c406d6e4-8d5d-4036-8b27-264485b2fbe3
changedFiles:
  - app/src/components/actions/run/popup/action_for_each_menu.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/action_popup_content.tsx
  - app/src/components/actions/run/popup/action_popup_frame.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/components/actions/run/popup/action_prompt_menu.test.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.tsx
  - app/src/components/actions/run/popup/action_selector.test.tsx
  - app/src/components/actions/run/popup/action_selector.tsx
  - app/src/components/actions/run/popup/action_selector_button.tsx
  - app/src/components/actions/run/state/action_run_input_store.node.test.ts
  - app/src/components/actions/run/state/action_run_input_store.ts
  - app/src/components/editor/placeholders/markdown_placeholder_typeahead_plugin.tsx
  - app/src/data/action_placeholders.ts
  - app/src/data/action_run_types.ts
  - app/src/data/data_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/main.js
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_for_each.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_run_request.js
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_text.js
  - desktop/src/actions/action/action_text.test.mjs
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/agent/agent_conversation.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
  - shared/action_for_each.d.mts
  - shared/action_for_each.mjs
  - shared/agent_conversations.mjs
---
# General feature description

The user should be able to attach a json list (file) to an action so it will run the same action in a loop on the card where each iteration in the loop is for a record in that list (the record becomes a part of the context for the conversation). All editors that can contain placeholders can then also have the 'data' placeholder, which has a second part for selecting the value in the json data.

* On the agent-action-popup, we have a context menu (prompt menu) that currently contains 2 menu items: `compact` & `add file` , we need to add 'for-each' here, which allows the user to select 1 json file that will be attached to the conversation as the 'for-each' data
* the placeholder looks like: `{{data xx.xx.x.xx}}` example `{{data countries.0.cities}}` so countries is a list, we take the item at index 0, field 'cities'
* when an action has a 'for-each' file attached, show a `loop` icon behind the action label in the action button at the top of the action popup. (the loop icon should be something like a horizontal 8)
* also show the loop icon in front of the 'prompt menu' button (vertical dots) that opens the prompt's context menu. The loop icon also opens a context menu where the user can configure the for-each:
  * remove: remove the json file and thus the loop
  * view: view the contents of the json file (external open)
  * at end: sub menu where user can select exclusively out of:
    * add prompt: add the next record as a new prompt to the same conversation
    * compact: when enabled, after every record in the json file, compact&#x20;
    * new conversation: start a new conversation for each record
  * on failure: sub menu where user can select exclusively out of:
    * log and continue: log the failure in the conversation and continue with the next record
    * stop on first failure: log the failure and stop the loop
* if the file only contains an object, than that becomes 1 record. if it contains a list, all items in that list are traversed.
* The electron app is responsible for performing the loop.

## Current state

The prompt menu currently supports `Compact` and `Add file`. `Add file` copies selected files through the attachment workflow and inserts Markdown links; it does not create loop input.

Action prompt placeholders come from one fixed list. Electron resolves those placeholders once, then executes one action run. Conversation records persist in activity JSON and survive popup and application restarts, but they do not contain for-each data or settings.

## implementation details

- Support for-each only for agent-action popup conversations. Keep it out of action definitions.
- Add `For each` to `ActionPromptMenu`. Accept one `.json` file, parse it before the run starts, and reject invalid JSON without changing the conversation.
- Store the attached file name, JSON value, loop mode, and failure policy on the conversation. Send this data as run-specific input when creating the conversation; Electron validates and persists it with the canonical conversation record. Reloading the conversation restores the loop configuration.
- Treat a root JSON object as one record. Treat a root array as its ordered records. An empty array completes without starting an agent turn.
- Add `{{data <path>}}` to every editor that uses action placeholders. Resolve `<path>` against the current record using dot-separated object keys and zero-based array indexes, for example `{{data countries.0.cities}}`. Insert strings unchanged; serialize numbers, booleans, `null`, objects, and arrays as JSON. A missing path fails that record.
- Extend the renderer-to-Electron run-input contract and its validation with the conversation-owned for-each configuration. Keep parsing, iteration, placeholder resolution, cancellation, and failure handling in Electron.
- Run records sequentially. Do not start the next record until the previous agent turn and configured end behavior finish.
- Provide three mutually exclusive loop modes:
  - `add prompt` (default): run the first record in the conversation, then submit each later resolved prompt as another turn in that conversation;
  - `compact`: use the same conversation and compact it after each record before submitting the next record;
  - `new conversation`: create a separate conversation for every record.
- Provide two mutually exclusive failure policies:
  - `log and continue` (default): append a loop-failure event to the affected conversation and continue with the next record;
  - `stop on first failure`: record the failure and do not start later records.
- A user cancellation stops the active turn and prevents all remaining records from starting.
- Show a loop icon after the action label and before the prompt-menu button when the displayed conversation or new-conversation draft has for-each data. The icon opens a menu with `Remove`, `View`, loop mode, and failure policy. Disable configuration changes while the loop is running.
- `Remove` clears the conversation's for-each data and settings. `View` opens the persisted JSON content externally through Electron; it must not depend on the originally selected file still existing.
- Keep normal single-run behavior, action-definition validation, and non-agent actions unchanged.
- Add focused renderer tests for file selection, restored conversation state, icon/menu behavior, and submitted run input. Add shared-schema tests for persisted conversation data. Add Electron tests for record normalization, data-path resolution, all loop modes, both failure policies, cancellation, invalid JSON, empty arrays, and restart recovery.

## acceptance criteria

- User can attach exactly one JSON file from `For each` in an agent-action popup. Selecting another file replaces the current attachment only after the new file validates.
- Invalid JSON shows an error and leaves current conversation configuration unchanged.
- Attached data and selected settings survive closing and reopening the popup and restarting the application.
- Root object produces one iteration. Root array produces one iteration per item in source order. Empty root array starts no agent turn.
- `{{data <path>}}` resolves from the current record in every editor that supports action placeholders. Object keys and array indexes work; missing paths fail only the current record.
- Default mode runs the first record in the selected conversation and adds each later record as a new prompt in that same conversation.
- `compact` mode compacts the same conversation after each record before the next prompt starts.
- `new conversation` mode creates one conversation per record and never continues a previous record's conversation.
- Loop mode offers exactly one selected value: `add prompt`, `compact`, or `new conversation`.
- Failure policy defaults to `log and continue`. Each failed record adds a visible failure event to its conversation, and the next record starts.
- `stop on first failure` records the failure and starts no later record.
- Cancelling a loop stops the active work and starts no later record.
- Loop icon appears after the action label and before the prompt-menu button while the displayed conversation has for-each data. Its menu can view persisted JSON, remove it, and change loop settings while idle.
- Removing for-each data restores normal single-run behavior without changing the action definition.
- Existing actions and conversations without for-each data keep current behavior.
