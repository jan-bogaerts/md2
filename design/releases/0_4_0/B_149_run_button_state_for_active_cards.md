---
author: 
id: B_149
internalId: bf6c8855-1ef1-464b-b1cc-3cfa9d7ee92e
title: run button state for active cards
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__bf6c8855-1ef1-464b-b1cc-3cfa9d7ee92e.json
policy:
---
When opening a project, the run buttons don't get the correct initial state like waitingForInput, or unread conversations.

they only update when opening the action popup, so most likely, this is when the activity file gets loaded and the action states gets updated?

seems like the 'action' buttons also don't show the state correctly sometimes (after reloading project). the conversation still needs to be 'finished' and the 'run' button shows it correctly (cause we opened the action popup), but the button for the action still waiting for response, is not showing the correct color.

so state calculation is somehow not correct

## Current state

An **active card** is a root-level Markdown card in configured working folder and shown on dashboard. Project opening loads these cards and their `agents` activity references, but `AgentIntegration` does not read referenced activity files automatically. `getAgentConversations` therefore returns an empty cache until an action popup calls `DataService.listAgentConversations` through `ActionConversationStore.load`.

`CardRunButton` derives persisted state from that cache through `useCardAgentState`. Before popup opens, it therefore appears idle even when a conversation is `waitingForInput` or has `viewed: false`. Here, **unread** means persisted conversation has `viewed: false`. Popup loading attaches conversations and emits scoped acknowledgement events, so Run button then updates.

`ActionSelector` has a second gap. It derives queued, running, and waiting colors only from live `ActionRunRegistry` runs. Registry has no restored run after reload. Selector checks persisted conversations only for unread terminal results, so persisted waiting action remains unmarked even after popup loads its conversation.

Existing loading code already caches completed and concurrent per-card requests, rejects stale project-load results, reports per-activity failures, and keeps archived or released card activity on demand. Existing button tests cover live and already-loaded conversations, but not project-open hydration without popup interaction.

## implementation details

* After first active-card snapshot is published, start background conversation loading for active cards. Do not await it before project becomes usable. Reuse `AgentIntegration.ensureAgentConversationsForCard` and its cache, in-flight request sharing, load generation, bounded activity reads, error reporting, and scoped notifications.
* Select active cards directly from root snapshot. Do not preload archived, released, action-definition, or other background-card activity. Opening those cards' action popups must keep current on-demand behavior.
* Keep persisted `viewed` values unchanged during preload. Loading activity may update button indicators; only existing visibility acknowledgement may mark conversation viewed.
* Derive each action selector button's persisted state from loaded conversations matching that action ID. Use same priority as card state: waiting, running, unread result, idle. A live queued, running, or waiting run overrides persisted state for that action.
* Put persisted action-state subscription in smallest selector-button leaf and use scoped `useSyncExternalStore` events. Snapshot must be primitive or stable, not a revision counter or cloned conversation array.
* Keep current warning, running animation, unread indicator, accessible label, tooltip, popup selection, and read-only behavior. Do not restore persisted conversations into `ActionRunRegistry`; registry continues to represent live runs only.
* Add regression tests in agent integration, Run button, and action selector coverage. Include delayed background hydration, active-only loading, cached popup reuse, persisted waiting and unread states, live-state override, failed activity loads, and project switch during an in-flight load.

## acceptance criteria

* Opening a project starts active-card activity loading without delaying first usable card snapshot.
* After activity loading completes, each active card Run button shows waiting, running, unread-result, or idle state without any popup having been opened.
* A `waitingForInput` conversation gives Run button warning state and matching accessible description before first click.
* A terminal conversation with `viewed: false` gives Run button unread indicator before first click; loading alone does not mark it viewed.
* When Run popup opens after reload, action button owning persisted waiting conversation shows waiting warning state even though no live registry run exists.
* Live queued, running, waiting, resumed, and terminal events continue to override or replace persisted display state correctly.
* Active-card preload and later popup load share cache and perform no duplicate activity read.
* Archived and released card activity remains unloaded until its action popup requests it.
* Activity-load failure leaves card usable, reports existing warning, and does not show fabricated state. Late result from previous project does not update current project.
