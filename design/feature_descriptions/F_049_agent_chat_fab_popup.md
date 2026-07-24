---
id: F-049
title: agent chat moves to a draggable FAB popup showing the card-run form
status: ready
owner: JB
policy:
  checkLinting: true
  requireTests: true
internalId: 5b6e9caa-5800-477c-835c-2129099d708a
---

## Goal

Relocate the agent chat out of the bottom conversation panel and into a popup that hangs off a
floating action button (FAB). The FAB can be dragged anywhere over the whole application; clicking it
opens the popup. Inside the popup, replace the current free-prompt chat with the same run form that the
card `Run` popup already uses, so there is one agent-run surface instead of two divergent ones.

## Current state

The agent chat lives in `AgentConversationList` (`app/src/components/agents/agent_conversation_list.tsx`),
rendered as a bottom panel in `TextView` (`app/src/components/text_view/text_view.tsx`, `isConversationPanelOpen && activeCard`).
It is only reachable in `viewMode === 'text'` by opening a card and clicking the "Agents" toggle in the
markdown editor's sticky toolbar (`app/src/components/text_view/list_editor_toolbar_controls.tsx`). See
`design/feature_descriptions/ready/B_066_running_actions_contract_gaps_after_f047.md` for the surrounding
running-actions rework.

`AgentConversationList` currently contains, top to bottom:
- a **free-prompt chat**: an "Agent prompt" `TextField` + "Start" button that calls
  `onStart` → `handleStartAgentConversation` → `runElectronAction(BUILTIN_CUSTOM_PROMPT, ...)`
  (`app/src/components/project_workspace.tsx`);
- the **live execution** display (status chip + streamed logs), plus a "Send" input for running agent executions;
- an **`ActionRunHistory`** (`app/src/components/actions/action_run_history.tsx`), loaded across every action
  applicable to the file's context;
- a **persisted conversations list** with a "No agent conversations" empty state.

Separately, clicking `Run` on a card opens `ActionPopup` in its "card run dialog" mode
(`app/src/components/actions/action_popup.tsx`, `isCardRunDialog`), which renders `ActionAgentForm`
(`app/src/components/actions/action_agent_form.tsx`) — extra prompt, Agent / Model / Thinking selectors,
run status, `ActionRunHistory`, related actions — with `Close` / `Schedule` / `Run` in a footer bar.

## Requirements

1. **Draggable FAB + popup.** Add a floating action button that overlays the entire application (not scoped
   to the text view). The user can drag it to any position over the app; its position persists in component
   state for the session. Clicking it opens a popup anchored to the button that hosts the agent chat; clicking
   again (or dismissing) closes it. Dragging must be distinguishable from a click so a drag does not toggle the
   popup.

2. **Show the card-run form instead of the free-prompt chat.** Inside the popup, render the same component
   currently shown when `Run` is clicked on a card (the `ActionPopup` card-run form / `ActionAgentForm`),
   rather than the bespoke "Agent prompt + Start" free-prompt input. The `Run` and `Schedule` buttons most
   likely need to move (e.g. from a fixed footer bar into the popup body / next to the form) to fit the FAB
   popup layout — confirm placement during implementation.

3. **Comment out run history and the conversations list (with a question).** The `ActionRunHistory` block and
   the persisted-conversations list ("No agent conversations") are of unclear purpose in this new layout.
   Comment out both components and add a code comment asking what they are for / whether they are still needed,
   so the decision is explicit rather than silently dropped. Do not delete the underlying loading code yet.

4. **Hide run history when empty.** Wherever `ActionRunHistory` is shown (the card-run form retains it),
   suppress it entirely when there are no previous runs, instead of rendering the "No previous runs" placeholder
   (`ActionRunHistory` `compact` currently shows a dashed "No previous runs" box; the non-compact form shows a
   "No previous runs" caption).

5. **Thinking is a functional dropdown.** On the run-action form the "Thinking" control must be an enabled
   dropdown (like Agent and Model), not a disabled/static field. Note: in the current code
   (`action_agent_form.tsx`) "Thinking" already renders as a `select` wired to `onThinkingLevelChange`
   (`use_action_popup_controller.ts`), so the implementer should first reproduce the observed disabled state
   and fix whatever actually disables it (agent without thinking support, a specific popup mode, or a stale
   build) rather than assume the markup is wrong.

## Implementation notes

- Reuse an existing drag pattern rather than adding a dependency — the pointer logic in
  `SplitLayout` (`app/src/components/shell/split_layout.tsx`) and the conversation-panel drag handlers in
  `TextView` are precedents; the card drag overlay (`app/src/components/card_view/card_drag_overlay.tsx`) is
  another. The FAB should live high enough in the tree to float over both card and text views
  (e.g. `MainWindow` / `ProjectWorkspace` level).
- The popup can reuse `ResizablePopover` (`app/src/components/resizable_popover.tsx`) the way `ActionPopup`
  already does, anchored to the FAB element.
- Decide the context the FAB popup runs against (the active card/file, or `BUILTIN_CUSTOM_PROMPT` for a
  no-card scratch run) — the existing free-prompt chat used the active card's `fileContext`.
- Keep the live-execution / `Send`-input behavior working if it is retained; if it moves, say so.
- Once the free-prompt chat is gone, check whether the "Agents" toolbar toggle, `isConversationPanelOpen`
  state, and the bottom panel in `TextView` are still needed or should be removed.

## Acceptance criteria

- A draggable FAB is visible over the whole app; dragging repositions it and does not open the popup; a plain
  click opens/closes the popup.
- The popup shows the card-run agent form (extra prompt + Agent/Model/Thinking + Run/Schedule), not the old
  "Agent prompt + Start" input.
- `Run` and `Schedule` work from the popup.
- The run-history block and conversations list are commented out with a question comment; run history, where
  still shown, is hidden entirely when there are no previous runs.
- The Thinking control is an enabled, working dropdown that changes the thinking level used for the run.
- Tests cover: FAB drag vs click, popup open/close, run history hidden when empty, and the Thinking dropdown
  changing the run input.

## See also

- `design/feature_descriptions/ready/B_066_running_actions_contract_gaps_after_f047.md`
- `design/feature_descriptions/ready/F_038_conversation_panel_splitter.md`
- `design/feature_descriptions/ready/F_012_agents.md`
- `design/feature_descriptions/ready/F_033_agent_and_model_selection.md`
- `app/src/components/agents/agent_conversation_list.tsx`
- `app/src/components/actions/action_popup.tsx`
- `app/src/components/actions/action_agent_form.tsx`
