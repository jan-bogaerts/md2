---
author: 
id: F_472
internalId: 9700b31c-8ed5-4ec1-bf04-012a1bef1eb5
title: no filters on actions for released cards
status: ready
owner: 
affects:
agents:
  - design/activity/card__9700b31c-8ed5-4ec1-bf04-012a1bef1eb5.json
policy:
branch: f_472_no_filters_on_actions_for_released_cards
worktree: 3
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup.tsx
  - app/src/components/actions/run/popup/action_popup_empty_state.tsx
  - app/src/components/actions/run/popup/action_popup_frame.tsx
  - app/src/components/actions/run/popup/action_popup_types.ts
  - app/src/components/actions/run/popup/action_selector.test.tsx
  - app/src/components/actions/run/popup/action_selector.tsx
  - app/src/components/actions/run/popup/action_visibility.node.test.ts
  - app/src/components/actions/run/popup/action_visibility.ts
  - app/src/components/actions/run/popup/action_visibility_mode_store.test.ts
  - app/src/components/actions/run/popup/action_visibility_mode_store.ts
  - app/src/components/actions/run/popup/historical_card_actions.node.test.ts
  - app/src/components/actions/run/popup/historical_card_actions.ts
  - app/src/components/actions/run/popup/use_historical_activity_key.ts
  - app/src/components/hooks/use_action_visibility_conversations.ts
  - app/src/services/storage/application_storage.ts
---

When opening the action-popup for a released card from list-view, (so action popup is opened from the card-editor), we only get the '+' action, so we can't see any historical conversation logs. this is not ok.

When opening an action-popup from this location, all action-buttons that have a conversation log should be visible.

In fact this should be an option that is always available on the action popup (through a context menu) to select which action buttons are available:

* all
* specific for context
* only those that have conversation logs

## Current state

`ActionPopup` gets its normal selector entries from `displayActionsForContext`, which applies each action's `appliesTo` filters. For a background card, `useHistoricalActivityKey` and `HistoricalCardActivityService` load referenced activity files. `historicalCardActions` then adds action identities found in stored runs or conversations to the context-specific actions. This already makes historical actions visible on many released cards, but it is automatic and cannot be changed by the user.

Released-card detection only makes execution read-only. `ActionSelector` renders the supplied actions in a horizontal button row and has no context menu or visibility preference. No service owns or persists an action-visibility mode.

Here, **conversation log** means a stored `AgentConversation` for the popup's current card or project context. Command run history without an `AgentConversation` is not a conversation log.

## implementation details

- Add three action-visibility modes: `All`, `Specific for context`, and `Has conversation log`.
- Store an explicit user choice globally through `applicationStorage`, not project configuration. A small `EventTarget`-based store beside the action-popup code owns the persisted value and exposes a stable snapshot for `useSyncExternalStore`.
- When no persisted choice exists, use `Specific for context` for normal popups and `Has conversation log` for released cards. Once the user chooses a mode, that global choice overrides both defaults in every project.
- Keep `displayActionsForContext` as the source for `Specific for context`. `All` contains every loaded user-defined action plus the built-in custom-prompt action, without applying `appliesTo`. `Has conversation log` contains only action IDs present in stored `AgentConversation` records for the current context.
- For a logged action that is no longer loaded, keep using a synthetic historical definition so its conversation remains selectable. Include the custom-prompt action in `Has conversation log` only when that context has a custom-prompt conversation. Do not treat command-only activity records as conversation logs.
- Use live card and project conversation snapshots for active contexts. Use referenced historical activity for background and released cards. Keep lists reactive when conversations are added or loaded.
- Open a MUI context menu when the user right-clicks the action-selector row. Show all three modes as mutually exclusive selected menu items. Prevent the browser context menu only within that row.
- When a mode change hides the selected action, select the first visible action using existing selector order. Preserve current protection for an action that drops out only because its card context changes during a live run.
- Keep the popup open while released-card activity is loading. Do not temporarily label context-specific actions as conversation-backed. If `Has conversation log` has no entries, show an empty selector state that can still be right-clicked to change mode.
- Keep released-card execution read-only in every mode. `All` changes selector visibility; it does not bypass released-card validation.
- Add focused store, action-derivation, selector-context-menu, popup-default, persistence, loading, empty-state, selection-change, and released-card regression tests.

## acceptance criteria

- With no saved preference, a normal action popup shows `Specific for context`; a released-card popup shows only actions having conversation logs.
- Right-clicking the action-selector row opens a menu containing `All`, `Specific for context`, and `Has conversation log`, with the active mode selected.
- Selecting a mode updates the open popup immediately and persists that choice globally across popup reopen, project change, and application restart.
- `All` shows every loaded user-defined action and custom prompt regardless of `appliesTo`; `Specific for context` keeps current applicability behavior.
- `Has conversation log` shows current, removed, and custom-prompt actions only when the current context has a stored `AgentConversation` for that action. Command-only history does not make an action visible.
- Released-card conversation actions remain selectable and their historical conversations remain readable, but no action can run from the released card.
- Changing mode never leaves a hidden action selected. A live action lost only through a card-context change remains available as it does now.
- While released-card activity loads, the popup remains visible without showing an incorrect action set. With no matching conversations, it shows an empty selector state and still allows mode changes through right-click.
- Normal action selection, initial-action resolution, active-run indicators, conversation loading, and horizontal selector scrolling continue to work.
