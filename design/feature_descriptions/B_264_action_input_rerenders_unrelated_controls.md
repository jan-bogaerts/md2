---
id: B_264
internalId: 78b279d6-eae4-4801-92c0-a6423a1fc880
title: Action input rerenders unrelated controls while typing
status: ready for implementation
after: 2a81b19c-14fc-49d9-98c1-f7101fcd8e14
branch: b_264_action_input_rerenders_unrelated_controls_while_typing
worktree: 1
agents:
  - design/activity/card__78b279d6-eae4-4801-92c0-a6423a1fc880.json
---

## Problem and evidence

With one action popup open and no action running, typing repeatedly renders unrelated popup controls and the Markdown editor wrapper/plugin tree. This violates the [architecture rule](../architecture/architectural_decisions.md) that layout components compose regions and subscriptions belong at the smallest boundary rendering the changing value.

The [performance trace](file:///C:/Users/janbo/Documents/dev/Trace-type-action-input.json) investigated for [F_411](F_411_action_input_does_mysterious_things.md) contains 429 React render markers and 225 commit markers between 6.34 and 40.46 seconds, with 137 input events. Repeated component records include `ActionPopupBottomRow`, `ActionAgentSelectors`, `ActionPromptMenu`, `ActionAgentPrompt`, `MarkdownEditor`, and editor plugins. These aggregate development-mode records are not one-to-one counts of keystrokes or visible changes.

This bug concerns excessive rendering. The trace does not establish the cause of the separately reported chatlog flicker.

## Verified causes and affected code

- `action_popup_bottom_row.tsx` subscribes to the complete prompt string. Every published draft edit renders the footer, including agent/model/security selectors and the prompt menu. Its displayed prompt-dependent decisions use whether trimmed text is empty, rather than the actual text.
- `action_agent_prompt.tsx` also subscribes to the complete prompt string, but uses it only to derive `promptEmpty`. Its rerender recreates `handleLiveChange` and processes the editor subtree even when emptiness and layout have not changed.
- `MarkdownDraft.edit()` publishes `valueChanged` when text changes. `ActionPromptDraft` forwards that subscription. The editor already has a separate external-replacement subscription through `useMarkdownDraft`; ordinary editor input must not cause an external replacement or remount.

Affected boundaries: the two components above, `ActionAgentSelectors`, `ActionPromptMenu`, `ActionPromptDraft`, and the draft/editor binding. Inspect editor plugin subscriptions separately before attributing their own selection or content updates to this parent-render problem.

## Required behavior

- Keep prompt text canonical in the draft service. Derive stable prompt readiness/emptiness values from actual service data and subscribe with `useSyncExternalStore` at the leaf that renders each value.
- Keep footer and input layout independent of ordinary text changes. Agent/model/security controls and the prompt menu must not rerender solely because another character was entered.
- Isolate prompt-dependent control behavior and ownership at its rendering boundary; moving markup alone is insufficient. Read the current complete prompt when submitting, flushing, or handling a shortcut.
- Preserve updates when readiness actually changes: empty or whitespace-only to nonempty and back, prompt preparation, run status, waiting questions, conversation selection, settings, and scheduling.
- Preserve editor focus, selection, undo, attachments, external replacement, and flush-before-send behavior. Content-dependent editor work remains necessary; unrelated parent-driven work must be removed.

The footer is used both inside `ActionPromptOwner` and directly by `CommandAction`; both require this behavior. `ActionAgentPrompt` is shared by agent and command input through `ActionPromptOwner`. Do not change shared draft/editor semantics without inspecting all consumers.

## Verification

- Add focused regression coverage showing ordinary nonempty-to-nonempty edits leave unrelated controls stable, while empty/nonempty transitions update Send/Run and Schedule correctly.
- Cover agent and command input, pending questions, explicit conversation changes, and external prompt replacement; verify submission uses the latest typed text.
- Repeat the single-popup trace. Compare unrelated component rendering during typing after initial loading settles; do not assert an exact development-mode render count. Run affected tests and the app linter when implementing the fix.
