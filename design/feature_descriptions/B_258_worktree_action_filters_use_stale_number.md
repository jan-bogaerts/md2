---
id: B_258
internalId: de054ddb-e1e5-44b7-a7a5-e16a9481a65f
title: Worktree action filters use a stale number after renumbering
status: design
---

## Bug

After PR [#24](https://github.com/jan-bogaerts/md2/pull/24), deleting or pruning an unrelated worktree can change an assigned card's displayed worktree number without changing its stored `worktree` field. The checkout and branch remain correctly assigned, but action filtering still uses the old number.

For example, a card assigned to worktree 2 moves to displayed position 1 after an earlier worktree is removed. An action filtered to worktree 1 does not match the card, while an action filtered to worktree 2 can match it even though the editor now labels 2 as another checkout.

## Current behavior and affected paths

* `app/src/data/action_context.ts` builds card and file action contexts from `card.header.worktreeValue`. `actionMatchesContext` compares `appliesTo.worktree` directly with that value.
* `app/src/components/actions/editor/action_filter_editor.tsx` builds worktree filter labels and values from current list positions.
* `desktop/src/actions/schedule/scheduled_card_context.js` also reads the stored card number for scheduled action contexts. PR #24 carries the expected branch for execution, but leaves this filter value unchanged.
* The worktree selector and project action context derive the current display number from the assigned branch. This issue concerns card and file action filtering, including scheduled card actions.

## Expected behavior

Actions shown and triggered for a card should agree with the worktree identified by the filter editor after list renumbering. A missing or invalid assignment should still fail safely. Resolving the filter semantics must not rewrite card metadata merely because Git reordered its list.

## Regression coverage

* With a card's stored number at 2 and its assigned branch now at position 1, verify which `appliesTo.worktree` value matches in the popup and in scheduled card action matching.
* Verify an action filtered to the number now occupied by another checkout does not match this card.
* Verify normal assignments and unavailable branches retain their existing behavior.
