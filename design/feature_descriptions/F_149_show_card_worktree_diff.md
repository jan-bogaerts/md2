---
author: JB
id: F_149
internalId: 290f3413-3d14-4ec2-b97d-e2522c3c1057
title: Show card worktree diff before integration
status: ready
owner:
affects:
  - desktop/src/git/diff_service.js
  - desktop/src/git/worktree_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
  - app/src/data/electron_action_bridge.ts
  - app/src/components/worktree_selector.tsx
  - app/src/components/card_view/card_commit_menu.tsx
  - app/src/components/card_view/card_commit_diff_panel.tsx
  - app/src/components/card_view/card_body_popover.tsx
agents:
  - design/activity/card__290f3413-3d14-4ec2-b97d-e2522c3c1057.json#conversation=agent-14d9ac4c-511b-4a31-9aa5-5426d3082bc2
policy:
branch: f_149_show_card_worktree_diff_before_integration
worktree: 1
---

## Problem

A card worktree can be integrated into the project, but the user cannot review the complete card worktree diff before doing so. The card popup can show diffs for historical commits recorded in card activity, but it does not include the current worktree changes that are waiting to be integrated.

## Required behavior

Add **View diff** to the same worktree menu as **Integrate into project**.

The new action must have exactly the same availability as **Integrate into project**. It is available only when the card has a valid assigned worktree with outgoing changes. If integration is unavailable, viewing the worktree diff is also unavailable.

Selecting **View diff** shows the net changes the assigned card worktree would bring into the project branch. The diff covers the complete worktree change set, not only the card Markdown file or one agent commit. Use the card's existing diff-viewing experience, including the card body diff and navigation to other changed files.

The card popup's existing diff selector must also contain this worktree diff:

- Show it as the first entry, above the historical commit diffs.
- Label it clearly as the current worktree changes; do not present it as a commit.
- Selecting it opens the same worktree diff as **View diff** in the worktree menu.
- Keep the existing historical commit ordering and behavior unchanged.
- Remove the entry as soon as **Integrate into project** is no longer available, including after successful integration.

The worktree diff is current repository state. Do not persist it in card activity and do not create a synthetic commit or activity record for it.

## Implementation constraints

The current diff contract is commit-based and runs the configured commit diff command. Add a separate read-only worktree-diff operation rather than putting placeholder commit data into `CardCommit` or `ActivityCommitReference`.

Resolve the worktree through `WorktreeService` from the card's assigned worktree. The backend remains responsible for Git access and returns normalized per-file diff data to the renderer. Reading the diff must not commit, stage, rebase, merge, or otherwise change either worktree.

Model the card popup selection as either a current worktree diff or a historical commit diff. Both entry points must use the same worktree-diff loading and presentation path. Derive availability from the same worktree status condition used by **Integrate into project** so the two controls cannot disagree.

Errors while loading the diff must be reported through `dialogService` and leave the card popup in a safe state. An invalid or removed worktree must not fall back to the primary project folder.

## Acceptance criteria

- A card with an integratable assigned worktree shows **View diff** beside the existing worktree actions.
- **View diff** is enabled if and only if **Integrate into project** is enabled.
- The displayed diff is the complete net worktree change set that integration would apply to the project branch.
- Added, modified, deleted, and renamed files that belong to that change set are represented correctly.
- The card popup diff selector shows **Current worktree changes** as its first entry while integration is possible.
- Selecting the menu action or the card popup entry opens the same diff.
- Historical commit diffs remain below the new entry and retain their existing order and behavior.
- The current worktree entry disappears after successful integration or whenever the worktree is no longer integratable.
- Viewing the diff does not mutate Git state or write card activity.
- Missing worktrees and Git failures are reported without showing a diff from another repository folder.

## Tests

Add coverage for:

1. Worktree diff generation across the project branch and assigned worktree.
2. Added, modified, deleted, and renamed files in the returned diff.
3. No Git mutation while reading a worktree diff.
4. Matching availability of **View diff** and **Integrate into project**.
5. The current worktree entry appearing first in the card popup diff selector.
6. Both entry points selecting the same worktree diff.
7. Removal of the entry after integration or loss of worktree eligibility.
8. Existing historical commit selection and ordering remaining unchanged.
9. Error reporting for invalid worktrees and diff-generation failures.
