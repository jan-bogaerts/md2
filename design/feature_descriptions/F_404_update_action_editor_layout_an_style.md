---
author: 
id: F_404
internalId: 5603103d-1d57-40e8-afae-095f12ac1695
title: Update action editor layout an style
status: ready
owner: 
affects:
agents:
  - design/activity/card__5603103d-1d57-40e8-afae-095f12ac1695.json
policy:
changedFiles:
  - app/f404.vitest.config.ts
  - app/src/components/actions/agent/action_agent_capability_fields.tsx
  - app/src/components/actions/editor/action_definition_fields.grouped.test.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
  - app/src/components/actions/editor/action_definition_group.tsx
  - app/src/components/actions/editor/action_filter_editor.tsx
  - app/src/components/actions/editor/action_ordered_collection.tsx
after: 21b6ec8e-0455-42ef-9680-36dd39c52fd5
---
See F\_392 where we applied groups to the sentry tab of the config dialog.

We now need to apply similar grouping in cards with titles and info to the action editor in list view.

Group the inputs logically by meaning.

Propose the groups to use.

## Current state

* In list view, `ListActionEditor` renders `ActionEditorContent`. Its Definition tab renders `ActionDefinitionFields` inside one outlined `Paper` headed “Action definition”. Agent actions also have separate Prompt and phrase tabs.
* The definition card starts with Label, Type, Output kind, Icon, Description, and optional user input. A divider precedes the state trigger and execution controls. Agent actions show worktree, auto commit, streaming, auto finish, and an already headed Agent override section; command actions show worktree, command window, and Command. Further dividers separate Applicability filters, Before, Output rules, and After.
* `ActionDefinitionFields` stages edits in `actionService.draftStore` and commits them on blur or button click at the outer card. `ActionEditorContent` owns read-only disabling and save, deletion, conflict, and validation messages. Grouping must preserve those boundaries.
* F\_392 groups Sentry settings in outlined cards with a title and short explanatory text. The list editor needs the same visual pattern, with heading levels appropriate to its existing `h2` title.

## implementation details

* Change definition layout only. Keep the “Action definition” `h2`, then show four outlined groups in this order. Each group has an `h3` title and short `body2` description.
  1. **Action details:** Label, Type, Output kind, Icon, Description, Ask user for, and conditional Version question. Description: “Name and describe this action, its output, and any input requested before it runs.”
  2. **Run settings:** Run when card enters state, Needs worktree, then type-specific controls. Agent controls include Auto commit, Streaming, conditional Auto finish settings, and Agent override; command controls include Show command window and Command. Description: “Choose when this action starts and how its agent or command runs.”
  3. **Availability:** Applicability filters. Description: “Limit the card or project contexts where this action is available.”
  4. **Action sequence:** Before, Output rules, After, in their existing order. Description: “Run linked actions before this action, when its output matches a regular expression, or after it finishes.”
* Replace the single outlined definition `Paper` and divider-based separation with a max-width stack of outlined groups. An action-specific group component can provide the shared card, heading, description, and content spacing; keep it in its own file. Retain one common wrapper for the existing blur and button-click draft commits. Use theme colors, borders, and spacing as in F\_392 and `design/STYLE_GUIDE.md`.
* Keep field labels, IDs, helper text, conditional visibility, enabled states, order within each group, validation, and draft persistence behavior. Keep Agent override nested within Run settings and make its heading `h4` under that group’s `h3`. Leave Prompt and phrase tabs, editor messages, and read-only behavior unchanged. No service or persisted action format changes.
* Update `action_definition_fields.grouped.test.tsx` to check four group headings in order and representative controls within each named group for agent and command actions. Existing editor tests must still pass. Run the relevant action editor tests, typecheck, and lint when implementing.

## acceptance criteria

* List-view Definition tab shows four outlined, titled groups with short descriptions: Action details, Run settings, Availability, Action sequence, in that order.
* Every existing definition control appears in its specified group. Agent and command controls still appear only for their respective action type; conditional input and auto finish controls still follow existing conditions.
* Before, Output rules, and After remain distinct, ordered editors within Action sequence. Applicability filters remain in Availability.
* Editing, validation, draft commits on blur or button click, read-only disabling, and save/conflict/deletion messages behave as before. Prompt and phrase tabs behave as before.
* Group headings form a valid hierarchy below “Action definition”; groups remain usable at narrow list-editor widths and in light and dark themes.
