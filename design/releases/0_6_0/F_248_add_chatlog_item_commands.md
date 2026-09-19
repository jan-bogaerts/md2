---
internalId: 3ca60eff-65bc-44d0-929f-451e034102c4
id: F_248
status: ready
title: add chatlog item commands
agents:
  - design/releases/0_6_0/card__3ca60eff-65bc-44d0-929f-451e034102c4.json
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat.tsx
  - app/src/components/actions/conversation/action_conversation_chatlog_tracker.ts
  - app/src/components/actions/conversation/action_conversation_command_service.node.test.ts
  - app/src/components/actions/conversation/action_conversation_command_service.ts
  - app/src/components/actions/conversation/action_conversation_copy_button.tsx
  - app/src/components/actions/conversation/action_conversation_event_markdown.node.test.ts
  - app/src/components/actions/conversation/action_conversation_event_markdown.ts
  - app/src/components/actions/conversation/action_conversation_event_row.tsx
  - app/src/components/actions/conversation/action_conversation_evolving_groups.tsx
  - app/src/components/actions/conversation/action_conversation_group_list.tsx
  - app/src/components/actions/conversation/action_conversation_history.tsx
  - app/src/components/actions/conversation/action_conversation_item_commands.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_item_commands.test.tsx
  - app/src/components/actions/conversation/action_conversation_message.tsx
  - app/src/components/actions/conversation/action_conversation_message_commands.tsx
  - app/src/components/actions/conversation/action_conversation_rendering.test.tsx
  - app/src/components/actions/conversation/action_conversation_store.node.test.ts
  - app/src/components/actions/conversation/action_conversation_store.ts
  - app/src/components/actions/conversation/action_conversation_transcript.tsx
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_definition_writer.node.test.ts
  - app/src/services/actions/action_definition_writer.ts
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/activity/activity_files.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
after: df17653d-859c-40cd-8515-2e3bf9e0da56
---
for chatlogs items, add buttons that allow:

* copy: copy markdown
* split: create a new conversation which is a duplicate of the current one, but drop everything after the split point. Could be that agents have special commands for this that might generate new conversation ids and such
* save:
  * First prompt: always save as new action
  * Others: save as action and save as response phrase for current action.

## Current state

`ActionConversationMessage` renders user and assistant messages as Markdown. `ActionConversationEventRow` and its specialized renderers show reasoning, commands, and tool events. Neither path exposes item commands. Terminal-tool and sub-agent groups only control expansion.

Conversation entries already have stable IDs and ordered `entries`. Conversations are stored inside project or card activity files; `AgentConversation.id` is identity and `path#conversation=<id>` is only persistence reference. Existing bridges can load conversations and update viewed or waiting state, but cannot create a split conversation.

`copyTextToClipboard` already supports browser, Electron, and remote-control pages. Prompt-to-action helpers already create and persist a new action. Response phrases already live in an action definition's `phrases` array as `{ title, text }`, but no focused operation appends one from chat history.

## implementation details

* Add a row action area to every user and assistant message: `Copy`, `Split`, and `Save`. Add only `Copy` to each reasoning, command, and tool/event row; group headers get no commands. Use tooltip-backed icon buttons with accessible names. Keep actions available to keyboard and touch users and prevent layout movement when hover actions appear.
* Copy message `content` unchanged, preserving its source Markdown. For events, serialize the complete row to Markdown independently of collapsed state: include the displayed label and status plus every detail that renderer can expose, such as reasoning sections, command, working directory, output, exit code, duration, generic content, and generic output. Put serialization in one pure helper used by all event renderers, then pass result to `copyTextToClipboard`. Report clipboard failures through `dialogService`.
* `Save` opens a menu. The earliest user message in canonical conversation `entries` is the "first prompt". Its menu contains only `Save as new action`. Every other user or assistant message also contains `Save as response phrase`. Determine this from canonical entries, not filtered or grouped render output.
* `Save as new action` opens a dialog with required action label and selected message preview. Create a new agent action through existing `createActionDefinition` and action persistence paths, using selected message `content` unchanged as `prompt`, current action context for `appliesTo`, and current action's agent, model, and permission mode when set. Generate new action ID, require a file path not already occupied, and leave source conversation unchanged.
* `Save as response phrase` appends `{ title: '', text: message.content }` to current persisted action definition. Add one focused `actionService` operation that resolves action by ID, preserves every unrelated definition field, validates updated graph, and queues existing action-file persistence. Disable this choice for built-in actions because they have no writable source file. Copy remains available in read-only projects; Split and both Save choices are disabled there. Report mutation failures through `dialogService` and prevent duplicate submissions while one command is pending.
* Define Split as a fork through selected message: copied `entries` contain every canonical entry up to and including selected message, so intervening tool and event history remains ordered; later entries are absent. Source conversation never changes. Split is unavailable while source conversation status is `running`, preventing a fork from a partially streamed assistant message.
* Add `splitActionConversation(reference, messageId)` to action bridge, preload/local dispatch, remote-control storage, and Electron action types. Backend loads referenced activity under project root, validates message ID belongs to referenced conversation, creates new `AgentConversation.id`, and writes clone through existing per-activity update queue. Returned conversation uses new reference in same activity file, title `<source title> (split)`, split time as `startedAt`, `completedAt: null`, `status: 'waitingForInput'`, `viewed: true`, empty `providerSessions`, zero stopped timer, and no copied usage or context-window totals. Preserve `actionId`, `cardInternalId`, `cardPath`, and retained entries.
* Do not reuse source `providerSessions`: provider session still contains entries after split point. Continuing split conversation must use existing transcript-context fallback, which starts new provider session from retained entries. Native provider fork commands are not required.
* After backend returns split conversation, add it to agent conversation service, update popup conversation store, and select it. Use returned `AgentConversation.id` as identity and returned path only for persistence/continuation. Add focused app tests for command scope, first-prompt detection, Markdown copy, save menus, read-only/built-in states, successful selection, and error reporting. Add desktop tests for inclusive slicing, metadata reset, source preservation, identity/reference generation, invalid references/message IDs, queued concurrent activity writes, and local/remote bridge parity.

## acceptance criteria

* Every user and assistant message exposes Copy, Split, and Save. Every reasoning, command, and tool/event row exposes Copy only. Group headers expose none.
* Message Copy writes exact source Markdown. Event Copy writes Markdown containing all fields that row can display, even when detail section is collapsed.
* First user prompt can only be saved as new action. Every other message, including assistant messages, can be saved as new action or current-action response phrase.
* New action has new ID and file, exact selected message content as prompt, current context applicability, and current agent settings. Existing action files are never overwritten.
* Saving response phrase appends exact selected message content with empty title and preserves all other current-action fields. Choice is unavailable for built-in actions.
* Split keeps selected message and every earlier entry, removes every later entry, leaves source unchanged, creates new conversation identity/reference, and selects fork. Split conversation can accept continuation without resuming source provider session.
* Split is disabled while conversation streams. Copy works in read-only projects; all persistence commands are disabled. Failures show through `dialogService`, and repeated activation while pending creates no duplicate action, phrase, or split.
* Focused app and desktop tests pass. App and desktop lint pass.
