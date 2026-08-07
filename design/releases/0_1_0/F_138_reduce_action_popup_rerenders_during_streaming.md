---
author: 
id: F_138
title: reduce action popup rerenders during streaming
status: ready
owner: 
affects:
agents:
  - design/releases/0_1_0/card__f9a450d8-0f93-4487-99f3-23dcc07b42b2.json#conversation=agent-0b2e6bc1-6d29-4234-82e8-9570c342bd93
policy:
internalId: f9a450d8-0f93-4487-99f3-23dcc07b42b2
after: cf144ebc-ebd3-4148-8ad8-99bac886dd3f
---

## Problem

While an agent is producing a response, short text updates (streaming deltas) arrive very frequently. Each delta currently causes far more rendering work in the action popup than necessary. The deltas themselves are wanted (text should appear as soon as possible); the problem is how much re-renders per delta.

## Investigation results (current behavior)

The popup shell (`app/src/components/actions/action_popup_content.tsx`) does **not** re-render on deltas: it holds no run subscription, subscriptions live in small "owner" components. The run registry (`app/src/services/actions/action_run_registry.ts`) publishes immutably: each delta produces a new `run`, new `conversation`, and new `entries` array, but **all entry objects except the one currently being streamed keep stable references** (see `appendAssistantMessage`, which only replaces the updated entry via `entries.map`). This stability is the property the fix relies on.

Two actual problems:

1. **The whole transcript re-parses markdown on every delta.** `ActionConversationChat` (`app/src/components/actions/action_conversation_chat.tsx`, entries map around lines 91-121) renders all entries inline. Each delta therefore runs `ReactMarkdown` (full markdown parse + AST render) for every historical balloon, not just the live one. Cost is the dominant one and grows linearly with conversation length.

2. **Four components subscribe to the whole `run` object** via `useActionRun`, so they re-render on every delta even though they do not need streaming text:
   - `ActionConversationPickerOwner`
   - `ActionAgentSelectorsOwner`
   - `ActionPhraseButtonsOwner`
   - `ActionAgentPromptOwner` (worst: the prompt editor re-renders per delta)

   Selector-based subscribers (`status`, `question`, `approvals`, the bottom row) already bail out via `Object.is` in `useSyncExternalStore` and are fine.

## Requested changes

1. **Memoize per-entry rendering.** Extract the message balloon and the event row from `ActionConversationChat` into small components wrapped in `React.memo`, keyed as today (`entry.id` for messages, `eventIdentity(entry)` for events). Because completed entries are referentially stable, only the streaming balloon re-parses markdown; everything else becomes a skipped render plus a trivial DOM diff. Scroll growth keeps working because the list container itself still re-renders (cheaply) and the existing `useLayoutEffect` stick-to-end logic stays intact.

2. **Narrow the four `useActionRun` users** listed above to `useActionRunSelector` calls that return primitives or stable slices, so they stop re-rendering per delta. While doing so, verify `selectErrorLogs` in `action_log_error_owner.tsx` returns a stable reference (if it filters/maps per call it also re-renders every delta and needs the same treatment).

3. **Optional, low priority:** memoize `visibleConversationEntries` / `hasAgentActivity` in `ActionConversationChat` (currently an O(n) scan over all entries per delta).

## Explicitly out of scope

- **Virtualizing the conversation list.** Entries have text-dependent variable heights, and after change 1 the per-delta work is one balloon re-parse plus browser layout. Virtualization would only matter for conversations with thousands of entries; not worth the complexity now.
- Changing the streaming update frequency or batching deltas — short updates should keep arriving as fast as they do today.

## Verification

With React DevTools profiler ("highlight updates") during a streaming run:
- before: the entire transcript flashes on every delta;
- after: only the last (streaming) balloon and the status row update; the prompt editor, phrase buttons, selectors, and conversation picker do not re-render per delta.
