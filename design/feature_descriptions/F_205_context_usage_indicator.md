---
author: 
id: F_205
internalId: ff2e0479-d268-4fd5-8ffb-c545422291dc
title: Context usage indicator
status: ready
owner: 
affects:
agents:
  - design/activity/card__ff2e0479-d268-4fd5-8ffb-c545422291dc.json
policy:
---

Currently using circular progress on action popup for context usage indicator.

This moves slow, so at beginning small. Add background to circle. Ex: put disabled full progress in background or similar, simpler dix.

## Current state

`ActionConversationChat` (`app/src/components/actions/conversation/action_conversation_chat.tsx`) renders context usage as an MUI `CircularProgress` (`variant="determinate"`, `size={16}`, `color="info"`), fed by `contextWindowUsedPercent()` in `conversation_context_window.ts`, which turns `conversation.contextWindowUsage` (`usedTokens` / `capacityTokens`) into a 0–100 whole-number percent, or `null` when the values are missing or invalid. It only renders when a percent is available.

`variant="determinate"` draws only the filled arc — no ring is drawn for the untraveled portion. At low percentages (early in a conversation) the arc is a near-invisible sliver, so the indicator reads as "empty"/absent rather than as a small value on a ring.

## Implementation details

- In `ActionConversationChat`, render a static full-circle track behind the existing determinate `CircularProgress`, stacked in the same position (e.g. `Box` with `position: relative`, track as `variant="determinate"` `value={100}` in a muted/disabled color, arc `CircularProgress` absolutely positioned on top).
- Track uses the same `size={16}` as the arc so both circles align exactly.
- Track is visual-only: `aria-hidden`, not part of the `Tooltip`/`aria-label="Context usage"` accessible name, and does not participate in `variant="determinate"`'s `value` semantics (always full, never reflects the percent).
- Keep existing behavior unchanged: still renders only when `contextWindowUsedPercent()` returns non-`null`; `color="info"` arc, tooltip text `Context usage: {percent}%`, `aria-label="Context usage"` stay on the arc.
- No change to `contextWindowUsedPercent()`, data flow, or polling — this is a rendering-only fix.

## Acceptance criteria

- Context usage indicator shows a full background ring at all times it is visible, regardless of usage percent.
- At low usage percentages (including single-digit and near-0%, e.g. 1–5%), the indicator is visibly a ring with a small filled arc, not an empty/invisible control.
- At 100% usage, the arc fully covers the track and the indicator reads as a solid filled ring.
- Background track uses a visually muted/disabled color, distinct from the filled arc's `info` color, so the filled portion remains legible against it.
- Indicator still appears only when `contextWindowUsedPercent()` returns a non-`null` value; behavior for missing/invalid `contextWindowUsage` is unchanged.
- Tooltip text (`Context usage: {percent}%`) and `aria-label="Context usage"` remain on the arc only; the background track is not separately announced to assistive technology.
- Existing tests in `action_conversation_chat.test.tsx` and `conversation_context_window.node.test.ts` continue to pass; add coverage for the background track's presence.