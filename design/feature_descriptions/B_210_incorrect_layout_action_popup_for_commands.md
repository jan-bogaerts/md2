---
author: 
id: B_210
internalId: df7f7a94-ee33-44a3-b499-2b230d484fef
title: incorrect layout action popup for commands
status: ready
owner: 
affects:
agents:
  - design/activity/card__df7f7a94-ee33-44a3-b499-2b230d484fef.json
policy:
after: 421a382c-ec00-4741-a8f7-eab2a949fcfe
branch: b_210_incorrect_layout_action_popup_for_commands
worktree: 2
changedFiles:
  - app/src/components/actions/run/popup/action_input_layout_store.test.ts
  - app/src/components/actions/run/popup/action_input_layout_store.ts
  - app/src/components/actions/run/popup/action_input_splitter.tsx
  - app/src/components/actions/run/popup/action_layout_surface.tsx
---
for command actions, the layout is incorrect: we show a splitter above the markdown input and the run history below the input.

the splitter should be between markdown editor and run history. it should be different from the agent-actions: it's position needs to be saved with a different config name.

also: do this properly: so no splitter in the same component as the markdown editor, but the command-action  component should contains input, splitter, history and agent-action component should contain chatlog-splitter-input. both components are allowed to have more, as architecture needs it, but this should be the basis

## Current state

- Bug remains valid. `ActionPopupContent` selects separate `CommandAction` and `AgentAction` components, but neither owns its splitter.
- Idle commands render `ActionPromptOwner`, then scheduling, status, and `ActionRunHistoryOwner`. `ActionPromptOwner` renders `ActionAgentPrompt`, which places splitter above input and owns resize state.
- Commands and agents share `md2.actionPromptHeight`. Agent questions use additional `md2.actionQuestionsBlockHeight`.
- Command input uses `MarkdownEditor` in plain-text, monospace mode; “markdown input” in original report means this editor, not Markdown formatting.
- During active command runs, command input disappears. A command can start an agent child: an agent step within that command run. `ActionAgentInteraction` then displays conversation and prompt.

## implementation details

- Move splitter rendering, pointer/keyboard handling, height limits, and persistence out of `ActionAgentPrompt`. Keep editor draft binding, preparation, shortcuts, and question behavior intact.
- `CommandAction` owns input, horizontal splitter, and run history in that order. “Splitter” means draggable, keyboard-accessible separator that changes vertical space allocated to adjacent regions. Keep scheduling, status, and controls available without placing them between input and splitter.
- `AgentAction` owns conversation, splitter, and input in that order. Refactor `ActionAgentInteraction` so commands running agent children reuse agent layout without duplicating prompt or splitter.
- Shared call sites: `ActionPromptOwner` serves idle commands and `ActionAgentInteraction`; both lose embedded splitter. `ActionAgentPrompt` has only `ActionPromptOwner` as production caller. Commands receive new input/history layout; agents retain conversation/input layout and question resizing.
- Keep persistent layout state in service beside popup components. Use `EventTarget` notifications and `useSyncExternalStore` subscriptions at smallest affected region; editor must not own splitter state.
- Save command input height under `md2.commandActionInputHeight` through `applicationStorage`. Retain existing agent keys. New command setting starts from named default; do not copy shared agent height into it. Existing storage bridge accepts arbitrary keys; no desktop API change needed.
- Bound heights against available popup space after header and controls. Scroll input and history independently; recompute limits when popup size changes. Preserve empty-input collapse, read-only history, active-run input hiding, and agent questions.
- Add behavioral regression coverage for layout order, resize direction, persistence isolation, reopen, and agent-child transitions. Run affected tests and app linter; do not run full suite.

## acceptance criteria

- Idle command popup shows input, splitter, then run history; no splitter above command input.
- Dragging command splitter downward grows input; dragging upward shrinks it. Keyboard resize works and separator exposes accessible name and current value.
- Saved command height survives popup reopen and application restart. Resizing commands never changes agent heights, and resizing agents never changes command height.
- Agent popup retains conversation, splitter, then input. Pending questions and command-started agent children remain usable with one prompt and one relevant splitter.
- Empty input/history, long content, small popup, full-height mode, and popup resizing keep controls reachable and prevent negative region heights.
- Command text, draft retention, submission shortcuts, scheduling, read-only behavior, and active-run transitions remain unchanged.
- Editor component contains no splitter or splitter persistence. Action layouts own composition; layout service owns view state.
