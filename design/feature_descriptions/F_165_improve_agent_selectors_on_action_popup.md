---
author: 
id: F_165
internalId: c38e7423-9b05-47e2-a728-9637a25f9a2e
title: Improve agent selectors on action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c38e7423-9b05-47e2-a728-9637a25f9a2e.json#conversation=agent-6127a6ec-3c7b-4396-8c07-e7063d6fd63a
  - design/activity/card__c38e7423-9b05-47e2-a728-9637a25f9a2e.json#conversation=agent-4dc74d55-efb3-45cc-b861-e72010ad23f2
policy:
branch: f_165_improve_agent_selectors_on_action_popup
worktree: 3
---
We need to improve and refactor the agent selector component.

First, ´app/src/components/actions/agent/action\_agent\_selectors\_owner.tsx´ is a useless wrapper. This should be handled by the selector itself, the concept of owner is wrong. The component does this itself.

Second, we need to move it from top to bottom. On the bottom row where token-usage and buttons are. Tehe selector is to the left (fist in box), token-line-change centered, buttons to the right.

Finally, display needs to be changed. The agent selector should be 2 buttons:&#x20;

* Model selector button. Displays the model and level. User can infer agent based on model. Ex ´gpt-5.6-sol medium´.   When clicked, open context menu with 3 sections:
* &#x20; Agent: claude, codex
* &#x20; Model: changes depending on value of agent
* &#x20; Thinking level
* Security button. Icon and color show selection: green, yellow red. On click, context menu opens.

## Current state

`ActionAgentSelectorsOwner` subscribes to run status and resolved settings, owns all selector change handlers, and passes thirteen values and callbacks to `ActionAgentSelectors`. `ActionAgentSelectors` only renders four compact `TextField` controls for agent, model, thinking level, and permission mode.

The selector row appears above agent conversation content. `ActionPopupBottomRow` separately renders the usage controls on the left and run controls on the right. Settings already persist through `ActionRunSettingsStore`; selectors stay disabled while settings load or a run is queued or running, but remain editable while an agent waits for input.

## implementation details

- Remove `ActionAgentSelectorsOwner`. Make `ActionAgentSelectors` receive `action`, `context`, and `settingsStore`, then own the existing run-status and settings subscriptions and change handlers. Preserve current setting rules: changing agent selects that profile's default model, resets thinking to `none`, and selects `ask-for-approval` when supported; changing model resets thinking to `none`.
- Remove selector rendering from `ActionPopupContent`. Render it only for agent actions in `ActionPopupBottomRow`, before the centered usage group. Lay out selectors left, the existing `tokens`, `changes`, and `lines` controls centered as one group, and run controls right. Keep all groups usable without horizontal overflow when popup width is constrained.
- Replace four visible fields with two compact buttons. Model button displays model and thinking level, for example `gpt-5.6-sol medium`. Its context menu has labelled Agent, Model, and Thinking level sections. Model choices update when agent changes; unavailable agents remain disabled.
- Security button uses a shield icon and selected permission-mode color: green for `ask-for-approval`, yellow for `approve-for-me`, and red for `full-access`. Its context menu shows all three permission modes with their existing labels and descriptions. For profiles without a permission adapter, show a neutral disabled security button with an unsupported explanation.
- Keep selectors disabled while settings load or run status is `queued` or `running`. Keep them enabled during `waitingForInput`; changes then retain `settingsChangedWhileWaiting` so next send applies restarted settings.
- Continue writing one complete settings object through `ActionRunSettingsStore`. Preserve optimistic updates, card-backed persistence, session-only non-card behavior, and existing `dialogService` error reporting.
- Update focused selector, bottom-row, and popup tests. Cover menu sections and dependent resets, security colors and unsupported state, disabled run states, waiting-input changes, placement, centered usage group, and absence of the removed owner.

## acceptance criteria

- Agent action popup bottom row shows model selector first on left, usage controls centered, and action buttons on right; selector no longer appears above conversation content.
- Model button shows current model and thinking level. Its menu exposes Agent, Model, and Thinking level sections, and model choices match selected agent.
- Security button shows shield icon and correct green, yellow, or red state. Its menu exposes `ask-for-approval`, `approve-for-me`, and `full-access`; unsupported profiles show a neutral disabled state.
- Agent, model, thinking-level, and permission changes keep current reset, persistence, waiting-input, and error behavior.
- Selectors cannot change while settings load or run is queued or running, but can change while agent waits for input.
- `ActionAgentSelectorsOwner` is removed; `ActionAgentSelectors` owns subscriptions and setting changes directly.
- Bottom row remains usable without horizontal overflow at supported popup widths.
