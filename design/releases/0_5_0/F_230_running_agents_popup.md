---
author: 
id: F_230
internalId: 06a8af54-38c9-4b9b-a9a4-bbdf563f036b
title: running agents popup
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__06a8af54-38c9-4b9b-a9a4-bbdf563f036b.json
policy:
after: 55de27a5-aa12-4048-9990-970a8382c5b2
changedFiles:
  - app/src/components/actions/run/popup/action_popup.tsx
  - app/src/components/actions/run/popup/action_popup_content.tsx
  - app/src/components/actions/run/popup/action_popup_initial_action.node.test.ts
  - app/src/components/actions/run/popup/action_popup_runtime.node.test.ts
  - app/src/components/actions/run/popup/action_popup_runtime.ts
  - app/src/components/actions/run/popup/action_popup_types.ts
  - app/src/components/actions/run/popup/card_action_popup_host_entry.test.tsx
  - app/src/components/actions/run/popup/card_action_popup_host_entry.tsx
  - app/src/components/merge_conflict_dialog.test.tsx
  - app/src/components/shell/running_agent_details_row.tsx
  - app/src/components/shell/running_agents_details.tsx
  - app/src/components/shell/running_agents_indicator.test.tsx
  - app/src/components/shell/running_agents_indicator.tsx
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
---

when user clicks on the 'running agents' button on the status bar, we show a popup containing a list of all agents currently running. it also includes an id, perhaps an internal id of the card it is running for.

we should improve this a little bit:&#x20;

* show the action name and card title
* when click on item in popup, open related action popup

## Current state

`RunningAgentsIndicator` combines two sources: direct background agents from `AgentConversationService`, currently `Search RegExp`, and active action runs from `ActionRunRegistry`. Direct agents already provide a label. Active-run summaries provide only `runId`, `rootActionId`, and status, so the indicator renders `Action <rootActionId>` and cannot identify the card in the list.

`RunningAgentsDetails` renders every entry as plain text. No row has click behavior. `ActionRun` already owns the action context, including canonical `cardInternalId` and the card title captured when the run started, but its global active-run projection omits that context.

`ActionPopup` can start with a requested action, while its runtime selects the latest run for that action and context. `CardPopupService` only exposes toggle behavior and does not carry a requested action or run. Therefore the running-agents popup cannot open the exact action run selected by the user.

## implementation details

* Extend `ActiveActionRun` with its `ActionContext`. Preserve `runId` as run identity, `rootActionId` as action identity, and `cardInternalId` as card identity. Do not use card path as identity.
* Build card-action rows with action label as primary text and captured card title as secondary text. Resolve the action label from loaded action definitions; keep the action ID as deterministic fallback if the definition disappears during a run.
* Keep non-card action runs and direct background agents visible with their current labels. They have no related card action popup, so render them as non-interactive list items.
* Render card-action rows as accessible buttons. Clicking one closes the running-agents surface, then opens an action popup for that row's `cardInternalId`, `rootActionId`, and `runId`. Closing the surface first prevents the desktop popover or mobile dialog from covering the action popup.
* Add a dedicated `CardPopupService` operation for opening a requested card action run. Store requested action ID and run ID in `CardActionPopupEntry`, pass both through `CardActionPopupHostEntry` and `ActionPopup`, and initialize `ActionRunBindingStore` with that exact run ID. If a popup for the same card context is already open, replace and reactivate it without cancelling the run.
* Keep existing `toggleAction` behavior unchanged for `CardRunButton` and list-editor toolbar call sites. Ordinary action-popup opening may continue to select the latest run; only running-agent row navigation requires exact `runId` binding.
* Retain current empty state, running count, active statuses, direct-agent lifecycle, desktop popover, and mobile dialog behavior.
* Add focused tests for active-run context projection, action/card labels, exact run binding when concurrent runs share an action and card, existing-popup replacement, non-interactive direct and non-card rows, and desktop/mobile navigation.

## acceptance criteria

* Each running card-action row shows configured action name and card title captured for that run; opaque action or card IDs are not shown during normal loaded-project operation.
* Clicking a card-action row closes running-agents details and opens related card action popup with that row's action selected and exact `runId` displayed, including when another run shares same action and card.
* Opening selected row does not start, stop, restart, or cancel agent. Existing popup for same card is replaced and brought to front.
* Project, file, folder, merge-conflict, and direct `Search RegExp` rows remain listed with current labels and have no click behavior.
* Running-agent count, empty message, live start/close updates, desktop popover, and mobile dialog continue working.
* Existing card action buttons and list-editor action button retain toggle behavior.
* Focused running-agent indicator, action-run registry, card-popup service, action-popup runtime, and host tests pass; app lint passes.
