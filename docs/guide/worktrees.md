# Worktrees

Git linked worktrees let several agents work on the same repository at once, each on its own branch in its own folder. md² ties a worktree to a card, so "which agent is changing what" has an answer.

Worktrees need local Git — desktop mode, or a browser connected through remote control.

## Registering worktrees

Config dialog → section **Project** → **Linked worktrees**.

- **Add linked worktree** creates one and registers it. md² parks it on its own branch (`md2/parking/…`) until a card claims it.
- **Remove worktree** unregisters it, after warning about anything that would be lost.

The list shows each worktree's folder, current branch, and status.

## Assigning a worktree to a card

Use the worktree indicator on the card (or the same selector in the card properties). Picking a worktree writes a one-based index into the card's `worktree` header field; picking **project folder** clears it and the card works in the main checkout.

A worktree can only be assigned to one active card at a time. An index that no longer matches a registered worktree is reported on the card as a worktree error instead of silently running somewhere wrong.

## Working from the card

The worktree menu on a card offers:

| Command | What it does |
| --- | --- |
| **Commit** | Commits the worktree's changes with a message you supply. |
| **Update worktree** | Rebases the worktree's branch onto the project branch. Enabled when the worktree is behind. |
| **Integrate into project** | Rebases the worktree onto the project branch when needed, then squash-merges its changes into the project branch as one commit. Enabled when the worktree is ahead. **Delete branch** removes the card's branch afterwards. |

When the worktree has uncommitted changes, **Update worktree** and **Integrate into project** ask for a commit message first.

Status is tracked as ahead/behind against the upstream, ahead/behind against the project branch, and whether the tree is dirty; the buttons enable themselves accordingly. Status refreshes after an agent run on that card finishes.

## Merge conflicts

When the rebase or squash merge hits a conflict, Git is paused and the **Resolve merge conflicts** dialog opens with one entry per conflicted file:

| Control | What it does |
| --- | --- |
| **External resolver** | Opens the file with `desktop.mergeConflictResolverCommand`. Disabled until that command is configured. |
| Agent action buttons | One per agent action with `appliesTo.kind` `merge-conflict`. Runs it for this file. |
| **Mark resolved** | Stages the file. |

Below the files, the same agent actions can run once for **all remaining files**. Conflicts are rescanned when an agent run ends.

**Continue** finishes the paused rebase or merge once every file is staged. **Cancel** aborts the Git operation.

A merge-conflict action receives {% raw %}`{{conflict-file}}`{% endraw %} (per-file run) and {% raw %}`{{conflict-files}}`{% endraw %}; see [Placeholders](../actions/placeholders.md).

## Actions that require a worktree

An action with `"needsWorkTree": true` only runs with card context and a valid worktree assignment. Missing assignment, invalid index, or an unavailable folder rejects the run before any process starts, and the validation error is shown in the popup.

Without `needsWorkTree`, actions run in the opened project folder.

md² never creates, assigns, commits, merges, or cherry-picks on its own during a run. Moving code between worktree and project is something you do from the card menu or through explicit actions you defined.

See also: [Git and commits](git-and-commits.md), [Action definition](../actions/action-definition.md).
