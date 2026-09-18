---
author: 
id: B_242
internalId: 6a5b2846-d8a5-4471-a511-6f9240eb75a9
title: project agent popup not part of popup stack
status: ready
owner: 
affects:
agents:
  - design/activity/card__6a5b2846-d8a5-4471-a511-6f9240eb75a9.json
policy:
after: 23d124ec-a23c-442f-af4d-f678be48084c
---

the project-agent-action-popup doesn't follow the rules of the other popups. it doesn't seem to be managed by the popup service as the other card and action popups. this is wrong. this popup should also follow the stack rules of who is on top.

## Current state

* `CardPopupService` (`app/src/services/card_popup_service.ts`) owns an ordered list of popup entries, where the last entry is top of stack. It provides `toggleAction`, `openActionRun`, `close`, `activate` (moves an entry to the end so it becomes top), `clear` when the open project or branch changes, per-entry mobile back-button dismissal, and a hidden fallback anchor so a popup survives its anchor element leaving the DOM.
* `CardActionPopupHost` (`app/src/components/actions/run/popup/card_action_popup_host.tsx`) renders every `action` entry, passing the array index as `stackPosition`, and on mobile opens only the entry whose id matches the last entry. `CardActionPopupHostEntry` wires `onActivate` to `cardPopupService.activate(entry.id)` and `popupEntryId` to the entry id.
* `ResizablePopper` turns `stackPosition` into a z-index of `theme.zIndex.modal + stackPosition`, and into an overlay theme so menus and tooltips opened inside the popup render above it. `ResizablePopper` calls `onActivate` on pointer-down and on focus, which is how clicking a buried card popup raises it.
* The project agent popup is rendered by `AgentChatFab` (`app/src/components/agents/agent_chat_fab.tsx`), outside that host. The fab keeps the open state in a local `useState` anchor element and generates `popupEntryId` with React `useId`. It passes no `stackPosition` and no `onActivate`, so `ResizablePopper` falls back to the bare `modal` z-index and to a paper element with no `tabIndex`.
* Consequences of standing outside the service, all caused by that missing entry:
  * Every card action popup, which sits at `modal + index`, paints over the project agent popup, and clicking the project agent popup cannot raise it because nothing calls `activate`.
  * The popup is not registered with `mobileBackDismissService`, so the mobile back gesture does not close it, and it does not follow the mobile top-only rendering rule.
  * Switching project or branch leaves it open, because `clear` only walks service entries.
  * `MarkdownTypeaheadLayerProvider` and the overlay theme receive `stackPosition ?? 0`, the lowest layer, rather than a real stack position.
* `cardPopupService.toggleAction` currently throws `Cannot open a card action popup without a card internal ID`, so a project context cannot be added to the stack today. `actionContextIdentity` already returns the constant `project` for a project context, so the duplicate-entry lookup that `toggleAction` performs needs no new key.
* `ActionConversationChat` (`app/src/components/actions/conversation/action_conversation_chat.tsx`) computes `popupVisible` as `context.kind === 'project' || popupEntries.at(-1)?.id === popupEntryId`. The `kind === 'project'` term is a workaround for this same bug: the fab's `useId` value is never present in the service entry list, so the comparison would always be false and the project agent conversation would never be marked viewed, leaving the unseen-result dot on the fab forever.
* The fab itself stays responsible for `dataService.listAgentConversations(PROJECT_CONTEXT)` on mount, for the running, queued, waiting and unseen badge states, and for dragging itself around the viewport. Dragging currently closes the popup through `handleDragStart`.

## implementation details

* Allow project contexts into the popup stack. In `CardPopupService.toggleAction`, replace the unconditional `cardInternalId` requirement with a check that accepts a context whose `kind` is `project` and still rejects a card context without an internal id. Keep entry shape, id generation, and `CardActionPopupEntry` unchanged, so the project entry is an ordinary `action` entry that happens to carry a project context.
* Add `closeAction(context: ActionContext)` to the service, which removes the `action` entry matching `actionContextIdentity(context)` if one exists and does nothing otherwise. The fab needs it for drag start, where closing must not toggle the popup back open.
* Rewrite `AgentChatFab` so it holds no popup state. `handleActivate` calls `cardPopupService.toggleAction(PROJECT_CONTEXT, nextAnchorElement)`; `handleDragStart` calls `cardPopupService.closeAction(PROJECT_CONTEXT)`. Delete the local `anchorElement` state, the `useId` entry id, the `handleClose` callback, and the `ActionPopup` element from the fab. Keep the conversation preload effect and all badge logic.
* Render the project entry from `CardActionPopupHost`, so it gets `stackPosition`, `onActivate`, and the entry id as `popupEntryId` from the existing `CardActionPopupHostEntry` path with no per-kind branch.
* View-mode visibility gets one deliberate exception. The host currently hides every popup when `viewMode` is `diagrams` or `stats`. A project-context entry must stay visible in `stats` view, so compute visibility as: hidden in `diagrams` view for all entries, hidden in `stats` view only for non-project entries. Diagram view keeps hiding the project popup because the fab that owns it is already unmounted there by `ProjectWorkspaceAvailability`, and diagram view runs its own action popups.
* Mobile keeps the top-only rule with no exception: on mobile the project entry is open only while it is the last entry, and it gains back-gesture dismissal automatically through the service's existing `reconcileMobileBackDismissRegistrations`, because that method walks all entries.
* Delete the `context.kind === 'project'` term from `popupVisible` in `ActionConversationChat`. Once the project popup is a real entry, its id is in the service list and the top-of-stack comparison resolves correctly on its own. Intended behavior change: while a card action popup covers the project popup, a finishing project agent run no longer clears the unseen-result dot on the fab; raising the project popup back to the top clears it.
* No change is needed in `ActionPopupFrame` for popup size persistence: it already selects `PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY` from `baseContext.kind === 'project'`, and the host passes the entry context through unchanged.
* Out of scope: `RunningAgentsIndicator` still lists project-level runs as non-clickable `plain` rows, because `openActionRun` requires a card internal id. That guard stays as it is.
* Tests to add or extend:
  * `card_popup_service.test.ts`: a project context can be toggled open and closed, a second toggle closes rather than duplicating, `closeAction` is a no-op when nothing is open, `activate` reorders a project entry, and a project or branch change clears a project entry.
  * `card_action_popup_host_entry.test.tsx` or a host-level test: a project entry renders with its stack position, stays visible in `stats` view, hides in `diagrams` view, and on mobile is open only when it is the last entry.
  * A fab test asserting activation delegates to the service and that the fab renders no popup of its own.
  * A conversation-visibility test asserting a project conversation is marked viewed only while its entry is top of stack.

## acceptance criteria

* Opening a card action popup while the project agent popup is open draws the card popup on top; clicking anywhere on the project agent popup raises it above the card popup, and clicking back on the card popup raises that one again.
* Focusing an input inside a buried project agent popup raises it, matching card popup behavior.
* Clicking the fab while the project agent popup is open closes it; clicking again reopens it, and no second project popup can exist at the same time.
* Dragging the fab closes the project agent popup and does not reopen it when the drag ends.
* Switching project or branch closes the project agent popup along with every card popup.
* On mobile, the back gesture closes the topmost popup, including the project agent popup, and only the topmost popup is rendered.
* The project agent popup remains open and usable in stats view, and is hidden in diagram view.
* Menus, tooltips, and markdown typeahead opened inside the project agent popup render above it, including when it has been raised above card popups.
* The project agent conversation is marked viewed, clearing the fab's unseen-result dot, only while the project agent popup is the topmost popup.
* Popup size persistence for the project agent popup still uses its own storage key and is unaffected by card popup sizes.
