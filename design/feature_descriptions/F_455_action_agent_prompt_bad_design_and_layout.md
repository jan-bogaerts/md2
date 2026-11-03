---
author: 
id: F_455
internalId: b498d656-e91c-45ad-8fdc-670525355e02
title: action agent prompt bad design and layout
status: ready
owner: 
affects:
agents:
  - design/activity/card__b498d656-e91c-45ad-8fdc-670525355e02.json
policy:
after: 1c16443d-df56-4133-997a-9a4dd0f404a1
branch: f_455_action_agent_prompt_bad_design_and_layout
worktree: 2
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/run/popup/action_popup_types.ts
  - app/src/components/actions/run/popup/agent_action.tsx
  - app/src/components/actions/run/popup/command_action.tsx
  - app/src/components/actions/run/popup/use_popup_target.ts
  - app/src/test/action_popup_runtime_fixture.ts
---
see [action_agent_prompt.tsx](app/src/components/actions/agent/action_agent_prompt.tsx):

* why is it receiving responsePrompts and bottomRow as properties? There must be a very good reason why you wrote the code like this since it is an explicit rule not to do this in the code base.
* when there are 'questions':
  * the component rerenders 8 times, why? can't we improve this
  * the layout is wrong: the questions box always takes up all the available space except for the fixed height of the 'Prompt' box. the way it should work: the prompt box should be minimum size as long as the questions box has not reached the min-content (max-height), the prompt box should fill the remainder of the space and it's content (so the responses bar and markdown editor should use all available space.
* after any edit, for instance in a card, when we switch away from the application while an action popup was open, it will do a full reload 3 times (so with each reload, it will do all the rerenders as described above). This is very strange behavior, nothing changed on the action, yet is still reloads multiple times.
* same thing after closing or opening a card: totally unrelated action popups reload. this is not correct behavior, as nothing about the action popups has changed, no data it relies on has changed.

## Current state

`ActionPromptOwner` owns prompt preparation, draft selection, attachments, scheduling, execution, phrases, and controls, while `ActionAgentPrompt` receives the resulting data and JSX. This separates the feature behavior from the component that should own it and makes `responsePrompts` and `bottomRow` feature-specific JSX properties.

The stores passed through the popup component tree are not global service references. `createActionPopupBindings()` creates `bindingStore`, `conversationStore`, `historyStore`, `inputStore`, `resultStore`, `scheduleStore`, and the layout stores for one selected action and context. `settingsStore` is also a scoped card/action or session/action store returned by a global service. Passing every scoped store separately exposes runtime wiring and creates large forwarding interfaces. The assignment and base contexts are scoped values rather than services; different open popups can have different contexts.

`ActionPopup` subscribes to the complete project state through `useProjectState()`. Any project snapshot replacement therefore rerenders the popup tree, including changes to unrelated cards. Several prompt consumers also subscribe to complete store snapshots while using only one or two fields.

Question display causes a run-state render followed by layout-store updates from `setInput()` and `ResizeObserver`. Development `StrictMode` doubles render calls. The layout store calculates `questionsMaxHeight`, but the component ignores it and uses `maxHeight: fit-content`; the prompt also uses a fixed allocation while questions are present. The focused prompt test file currently has two failing question-height tests that expose this mismatch.

## Implementation details

1. Delete `ActionPromptOwner` and render `ActionAgentPrompt` directly from `AgentAction` and `CommandAction`.
2. Move prompt draft selection, preparation, attachment handling, scheduling, run-shortcut handling, phrase buttons, bottom controls, questions, and prompt layout into `ActionAgentPrompt`.
3. Pass `ActionAgentPrompt` the action, assignment context, base or schedule context, the existing `ActionPopupRuntime`, and whether questions are enabled. `ActionAgentPrompt` must unpack its scoped stores from the runtime instead of receiving each store as a separate property. Do not pass prepared JSX, the prompt draft, conversion messages, or feature handlers from a wrapper component.
4. Remove `responsePrompts` and `bottomRow`. `ActionAgentPrompt` must render `ActionPhraseButtonsOwner` and `ActionPopupBottomRow` in their required positions itself.
5. Keep runtime stores scoped to their popup session. Do not replace them with imported singletons. Leaf components that do not consume the complete runtime must continue to receive only the specific scoped store they use. Import true global application services directly when appropriate.
6. Continue passing assignment and base contexts as scoped values. Use `cardInternalId` as card identity; use paths only for loading, persistence, selection references, and continuation inputs.
7. Remove the complete-project subscription from `ActionPopup`. Subscribe separately to the current project reference and the target card fields actually used by the popup: identity, title, worktree assignment, and conversation/activity references. Resolve card subscriptions by `cardInternalId`; paths remain persistence locations and must not become popup identity.
8. Read persisted action state only when selecting the initial action. Do not retain a project-snapshot subscription for that initialization value. Subscribe to historical activity only for historical contexts.
9. Replace complete prompt-store snapshots with stable projections for the values that affect prompt rendering: run status, active action type, interaction readiness, question identity, selected conversation, conversation loading state, and conversion message. Event handlers must read current values directly when a value does not affect rendering.
10. Do not subscribe to schedule card options while the schedule popover is closed. Mount the card-list consumer only while the popover is open.
11. In automatic question layout, size the questions region to its content up to `layout.questionsMaxHeight`. Let the prompt use the remaining height, with the markdown editor flexing while phrase buttons and the bottom row remain fixed. Keep the existing persisted, explicitly resized layout behavior.
12. Publish a layout snapshot only when a layout value changes. A question update may cause one render for the relevant run projection and one additional render only when measurement changes the layout snapshot.

## Acceptance criteria

* `ActionPromptOwner` and its file are removed, and both agent and command flows render `ActionAgentPrompt` directly.
* `ActionAgentPrompt` owns the complete prompt feature and has no `ReactNode`, `responsePrompts`, or `bottomRow` properties.
* `ActionAgentPrompt` receives one `ActionPopupRuntime` instead of separate properties for every runtime store, and no intermediate component forwards those stores individually.
* Two open popups retain separate runtime-store instances and cannot observe or mutate each other's prompt, conversation, history, schedule, result, binding, or layout state.
* Assignment and base contexts remain explicit scoped values and retain `cardInternalId` as canonical card identity.
* Editing, opening, or closing an unrelated card does not render `ActionPopupContent`, `ActionAgentPrompt`, the prompt editor, phrase buttons, or bottom controls in an already open popup.
* Replacing a project snapshot without changing a popup dependency does not reconfigure the popup session or recreate its runtime stores.
* Changing the target card title updates only the target display. Changing its worktree updates only worktree-dependent UI. Changing its conversation/activity references updates only conversation or historical-activity consumers.
* Closed schedule UI does not render because another card changes.
* When questions fit below `questionsMaxHeight`, the questions region uses its content height and the prompt fills the remaining space.
* When questions exceed `questionsMaxHeight`, the questions region is capped and scrolls; the prompt remains at least `promptMinHeight`.
* The markdown editor fills the prompt space not used by phrase buttons and the bottom controls.
* A question update causes no more than one prompt render from run state and one additional render when the measured layout snapshot changes, excluding development `StrictMode` duplication.
* Existing prompt resizing, restored questions, command input, scheduling, phrase insertion, attachments, and keyboard-run behavior continue to work.
* Focused popup and prompt tests pass, including regression tests for unrelated project changes and question layout.
