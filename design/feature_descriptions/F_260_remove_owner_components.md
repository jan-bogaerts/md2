---
author: 
id: F_260
internalId: 2775052a-2e84-4466-a320-155c8ec05bac
title: remove owner components
status: design
owner: 
affects:
agents:
  - design/activity/card__2775052a-2e84-4466-a320-155c8ec05bac.json
policy:
after: 9700b31c-8ed5-4ec1-bf04-012a1bef1eb5
---

# Problem

The action UI still contains components whose names end in `_owner`. Most split one feature into a
subscription/behavior component and a presentation component that has no other production caller. This adds a
component and prop boundary without reuse.

Changing service data must still rerender only the smallest component that displays it. The component rendered by
the feature parent must therefore subscribe to its own changing data instead of making the parent subscribe and pass
derived values down.

`ActionPromptOwner` has already been removed. `ActionAgentPrompt` now owns its subscriptions and behavior and is
rendered directly by agent and command actions.

# Refactoring rule

For an `_owner` component whose child has no other production caller:

* Move the subscriptions, event handlers, effects, and conditional rendering into the named feature component.
* Change callers to render that feature component directly and pass services, stores, and structural inputs.
* Remove props that only carried values or callbacks derived by the `_owner` component.
* Delete the `_owner` file and update its tests.

Keep a separate component boundary only where it has a verified independent purpose. Give that component a name
that describes its feature or lifecycle role; do not use `Owner` or `_owner`.

Do not move subscriptions into `ActionAgentPrompt`, `AgentAction`, `CommandAction`, `ActionPopupFrame`,
`ConversationMetaInfo`, or another layout parent merely to remove an `_owner` file. Subscriptions remain at the
smallest component that renders the changing value.

# Required changes

## Merge owner and child

The following children have no second production caller. Each must absorb the behavior currently held by its
corresponding `_owner` component.

| Current owner | Target component | Production caller(s) after refactoring |
| --- | --- | --- |
| `actions/agent/action_agent_question_owner.tsx` | `ActionAgentQuestion` | `ActionAgentPrompt` |
| `actions/editor/action_phrase_buttons_owner.tsx` | `ActionPhraseButtons` | `ActionAgentPrompt` |
| `actions/conversation/errors/action_log_error_owner.tsx` | `ActionLogError` (rename `ActionLogErrorDisplay`) | `AgentAction` |
| `actions/run/popup/action_usage_summary_owner.tsx` | `ActionUsageSummary` | `ConversationMetaInfo` |
| `actions/conversation/picker/action_conversation_picker_owner.tsx` | `ActionConversationPicker` | `ActionPopupFrame` |
| `actions/run/state/action_run_status_owner.tsx` | `ActionRunStatus` | `AgentAction`, `CommandAction` |
| `actions/run/state/action_run_history_owner.tsx` | `ActionRunHistory` | `AgentAction`, `CommandAction` |

Preserve the existing behavior in each target, including live-run precedence over stored results, restored agent
questions, conversation loading and pinning, history loading, phrase insertion and double-click execution, usage
scope switching, and the current empty-state rendering.

## Preserve the schedule mounting boundary

Rename `ActionScheduleOwner` and `action_schedule_owner.tsx` to `ActionSchedule` and `action_schedule.tsx`.
`ActionAgentPrompt` renders `ActionSchedule` directly.

`ActionSchedule` subscribes only to `ActionScheduleStore.getOpenSnapshot`. While the schedule is closed it returns
`null` and must not mount `ActionSchedulePopover`. Consequently, the closed schedule must not:

* subscribe to project-card changes through `dataService`;
* read project configuration;
* subscribe to Claude or Codex rate-limit data;
* mount the MUI popover or its form.

When the schedule opens, `ActionSchedule` mounts `ActionSchedulePopover`, which retains the existing form,
registration, prompt-flush, error-reporting, portal, and close behavior. This is a deliberate lifecycle boundary,
not an owner/presentation split.

## Keep and rename the worktree adapter

`WorktreeSelector` is genuinely shared by the card view and action popup. Keep the action-specific adapter, but
rename `ActionWorktreeSelectorOwner` and `action_worktree_selector_owner.tsx` to `ActionWorktreeSelector` and
`action_worktree_selector.tsx`.

The adapter continues to own the bound-run, active-sequence-worktree, and open-worktree subscriptions. It must
preserve sequence assignment display, the disabled reason, and the key that resets selector-local state when the
displayed assignment switches between the normal and sequence worktree.

## Remove unused preset-name components

`ActionAgentPresetNameOwner` and `ActionAgentPresetName` have no production callers. Delete both files instead of
merging them. Do not add a replacement or compatibility export.

# Compatibility and failure cases

* Do not change service or store state ownership, event names, snapshot shapes, or action execution behavior.
* Do not replace granular subscriptions with a complete action, card, conversation, or run snapshot in a parent.
* Preserve `AgentConversation.id` as conversation identity. Paths remain persistence and selection references.
* Keep schedule subscriptions unmounted while closed. A hidden popover whose data hooks remain subscribed does not
  satisfy this requirement.
* Preserve error reporting through `dialogService` and safe empty states.
* Do not add compatibility aliases for removed `Owner` exports.

# Testing

* Rename owner-focused tests to the resulting component names and keep their user-visible assertions.
* Keep the schedule regression test that verifies no project-card subscription, project-config read, or dialog exists
  while scheduling is closed. Run the schedule registration, portal, close, prompt-flush, and error tests after the
  rename.
* Move the log-error and usage-summary owner integration coverage to `ActionLogError` and `ActionUsageSummary`.
* Run the existing question, conversation-picker, run-status, run-history, and worktree-selector tests affected by
  the changed imports and props.
* Run `npm run lint` in `app` after the refactoring.

# Acceptance criteria

* `app/src` contains no `_owner` files, `Owner` component exports, or `_owner` imports.
* The seven unshared owner/child pairs above are consolidated into their named feature components.
* The schedule and worktree boundaries remain, with names that describe their roles.
* The unused preset-name pair is removed.
* Opening and closing the schedule preserves its current lazy subscription lifecycle.
* Changing action state rerenders the smallest component that displays the change, without adding subscriptions to
  layout parents.
