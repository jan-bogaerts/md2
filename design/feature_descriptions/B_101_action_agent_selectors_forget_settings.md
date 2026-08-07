---
author: 
id: B_101
internalId: 1e3a953f-e81b-42a5-9586-0dbb87e389f8
title: action-agent-selectors forget settings
status: design
owner: 
affects:
agents:
  - design/activity/card__1e3a953f-e81b-42a5-9586-0dbb87e389f8.json#conversation=agent-7141e267-a1c8-4e23-bbbd-ac4ad79379d6
  - design/activity/card__1e3a953f-e81b-42a5-9586-0dbb87e389f8.json#conversation=agent-58be3baa-84fc-43bd-b880-a95d81ed80aa
policy:
branch: b_101_action_agent_selectors_forget_settings
worktree: 2
---
when you close and re-open an action popup, the selected agent configuration is lost and appears to go back to default.

## Current state

`ActionPopupContent` creates a new `ActionRunInputStore` for each action/context mount. Selector changes update that store, but closing the popup destroys it. Reopening creates an empty snapshot, so `useActionRunSettings` resolves agent, model, thinking level, access level, and approval policy from the action definition and desktop defaults again.

Card activity schema version 2 stores conversations and completed run records. It has no per-action settings. `loadCardActivity` can read the file, while targeted activity updates currently cover conversation state only. Backend writes are already serialized per activity file, which prevents concurrent conversation, history, and view-state writes from replacing each other.

## implementation details

* Add `actionSettings`, keyed by stable action ID, to card activity. Each value stores resolved `agent`, `model`, `thinkingLevel`, `accessLevel`, and `approvalPolicy` strings. Empty strings remain valid provider defaults. Bump activity schema version and migrate versions 1 and 2 by adding an empty settings object.
* Apply persistence to any card-backed action context containing `cardInternalId`, including its card and file entry points. Project, folder, and regular-file contexts have no card activity and keep current session-only behavior.
* Add one central renderer settings service with stable stores keyed by `cardInternalId` and action ID. Service loads saved settings, owns mutations and waiting-run dirty state, publishes only scoped `EventTarget` events, and clears runtime stores when project changes.
* Popup roots perform only stable store lookup and never subscribe. Selector, prompt, phrase, preset-name, disabled-message, and bottom-row owners use `useSyncExternalStore` at their leaf boundary when they consume settings. Event handlers send field-change commands to central store; they never mutate snapshots or activity objects.
* Keep selectors and run controls disabled while initial settings load, preventing a flash or run with defaults. When no saved entry exists, service exposes current action/config defaults. First user change stores one complete resolved settings object.
* An agent change updates dependent model, access, approval, and thinking values in one store command and one persistence request. While a conversation waits for input, same command marks settings changed so closing and reopening popup cannot bypass restart behavior from B\_94. Successful application clears only transient dirty marker, not saved selection.
* Add targeted bridge operation accepting `cardInternalId`, action ID, and complete settings value. Backend validates identity and values, then performs queued read-modify-write through existing atomic activity writer. Settings writes create no dedicated Git commit; later normal activity commit can include file.
* Update UI optimistically. If persistence fails, report through `dialogService`; restore previous snapshot only when failed request is still latest, so older failure cannot overwrite newer choice. Keep failed choice retryable.
* Preserve saved values when profile or capability configuration later changes.  silently replace persisted choice with defaults when not available.
* Add shared schema/migration tests, backend targeted-update and queued-write race tests, local and remote bridge tests, central-store lifecycle/event/failure tests, and popup tests covering close, reopen, action switching, waiting conversations, and app restart.

## acceptance criteria

* Changing any agent selector in card-backed popup writes complete selection to that card's activity file under action ID.
* Closing and reopening same card action shows saved selection. Restarting app and reopening it shows same selection.
* Settings for different cards or actions remain independent. Card rename does not lose them because storage uses `cardInternalId`.
* Selector and run-control leaves update from scoped central store events; popup roots and unrelated cards/actions do not re-render.
* Reopening during `waitingForInput` retains changed-settings state, so next Send restarts with saved selection instead of using old process settings.
* Existing activity versions migrate without losing conversations or records. Concurrent settings, conversation, history, and viewed-state writes preserve every field.
* Loading or saving failure is shown through `dialogService`; malformed data does not silently fall back to defaults.
* Unavailable saved configuration reverts to default
* Project, folder, and regular-file action popups keep current session-only selector behavior.