---
author: 
id: B_142
internalId: 5936b8d1-a0b9-4d53-9edf-e753e80796dd
title: changed and added lines in action not correct
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__5936b8d1-a0b9-4d53-9edf-e753e80796dd.json
policy:
branch: b_142_changed_and_added_lines_in_action_not_correct
worktree: 1
---

when an agent changes files, we track the total of lines changed, deleted and added. it seems we either display it incorrectly or something is going wrong while tracking it.

the action only shows changed/deleted, not nr of lines that were added. so the count is way off.

## Current state

Completed action commits already retain Git `insertions`, `deletions`, and `filesChanged` metadata in card activity. `ActionUsageSummary` sums this metadata for selected conversation or action/card scope. It renders `lines` as one total: insertions plus deletions. Breakdown appears only in tooltip, so visible value does not identify added versus deleted lines.

Separate `changes` value comes from completed provider file-change patches. It is not Git commit line total and must remain unchanged.

## Implementation details

* Define **line change** as one Git diff operation: one inserted line or one deleted line. Replacing one line counts as one deletion plus one insertion; Git provides no separate modified-line count.
* In `ActionUsageSummary`, keep total line-change count and show explicit insertion and deletion counts in visible `lines` control, for example `lines: 9 (+6 / -3)`.
* Use existing success color for insertions and error color for deletions. Preserve compact-prefix behavior, scope toggle, accessible button name, number formatting, and commit-detail tooltip.
* Apply same format to conversation and action/card line values in tooltip. Sum all captured commits already selected by `scopedActionUsage`; do not combine provider-patch `changes` with commit line metadata.
* Keep line control hidden when both insertion and deletion totals are zero. When only one total is zero, display that zero so meaning stays explicit.
* Update focused `ActionUsageSummary` tests for visible totals, addition/deletion breakdown, both scopes, zero-sided diffs, and tooltip text. No desktop Git parsing, activity schema, persistence, history loading, or provider event changes are required.

## Acceptance criteria

* Commit metadata with 6 insertions and 3 deletions displays `lines: 9 (+6 / -3)` in expanded layout.
* Compact layout may hide `lines:` prefix, but still displays total, insertions, and deletions.
* Additions-only and deletions-only histories display missing side as zero; history with no line changes displays no line control.
* Conversation scope counts only commits whose `rootConversationId` matches selected conversation. Action/card scope counts all loaded commits for action on card.
* Tooltip reports same total, insertion count, and deletion count as visible control and keeps per-commit details.
* Existing token totals, provider-patch `changes`, scope switching, commit capture, persistence, and history behavior remain unchanged.
* Focused usage-summary unit and component tests pass.
