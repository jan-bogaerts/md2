---
author: 
id: B_233
title: Move agent activity reference assignment to backend
status: new
owner: 
affects:
policy:
internalId: df17653d-859c-40cd-8515-2e3bf9e0da56
---

Card activity references are assigned by every React instance that observes an agent run. With remote control active, the desktop and remote renderers can process the same event and persist competing versions of the card. Activity persistence and its card reference must have one backend owner.

## Current state

Before an interactive card agent starts, `runElectronAction` reserves a conversation, adds the returned activity path to the card through `dataService.cards.addAgentLogReference`, and flushes the renderer's pending card changes. `AgentIntegration` also handles card-scoped `agentStarted` and `agentClosed` events by adding the same reference through the card save path.

Each renderer has its own card state and action-run subscription. A remote connection does not make the desktop renderer inactive, so both renderers can schedule a card commit from one backend event. Git index mutations are serialized, but the card contents originated from separate renderer snapshots and can still overwrite newer fields.

The desktop agent runner already knows the canonical `cardInternalId`, current card persistence path, activity path, and conversation before it publishes `agentStarted`. It persists the initial conversation checkpoint before publishing that event, but it does not own the corresponding card frontmatter update.

## Implementation details

* Make the desktop backend own card activity-reference assignment for every card-scoped agent start, including interactive, unattended, scheduled, and state-triggered runs. Continuations remain idempotent and do not add duplicate paths.
* In the backend conversation-start persistence path, persist the initial conversation checkpoint and add its activity file path to the card's `agents` frontmatter before publishing `agentStarted` or spawning work that depends on the reference. Use `cardInternalId` as card identity; use the current card path only to locate the Markdown file, and fail if the file's identity does not match the activity origin.
* Serialize the activity-file and card-frontmatter update as one backend-owned persistence operation. A successful operation must leave both the activity JSON and card reference present. On failure, do not publish a successful start or leave a card reference to an absent activity file.
* Add a focused backend Markdown frontmatter operation that appends one `agents` list value without changing unrelated fields, body content, field ordering, or line endings. Keep insertion idempotent. Do not introduce a second card domain model in the desktop app.
* Remove renderer writes from conversation reservation and from `AgentIntegration` handling of `agentStarted` and `agentClosed`. Those events update only loaded conversation state and notify subscribers; they must not call `addAgentLogReference`, schedule card persistence, or commit project files.
* Let normal project-file watching apply the backend card change to every connected renderer. Receiving that external update must not cause another persistence write.
* Keep project-scoped conversations unchanged because they have no card reference. Keep activity loading, conversation identity, acknowledgement state, and transcript rendering unchanged.
* Add focused tests for backend creation and linking order, identity mismatch, persistence failure, duplicate and continuation handling, unattended starts, and two renderer subscribers receiving the same event without either scheduling a card write. Update existing frontend tests that currently require `agentStarted` to persist the reference.

## Acceptance criteria

* Starting a card-scoped agent persists its activity JSON and adds that activity path to the matching card before `agentStarted` is published.
* Interactive, unattended, scheduled, and state-triggered card agent runs use the same backend-owned reference path.
* Continuations and repeated events never add duplicate `agents` entries.
* `agentStarted` and `agentClosed` cause no renderer-side card or project-file persistence.
* With desktop and remote React instances connected, one agent start produces one backend card-reference update; both renderers may consume the event without competing commits.
* A missing card, mismatched `cardInternalId`, or failed activity/card persistence prevents the run from reporting a successful start and produces a clear error.
* Unrelated card frontmatter, body content, formatting, and line endings remain unchanged.
* Project-scoped conversations and existing conversation loading continue to work unchanged.
