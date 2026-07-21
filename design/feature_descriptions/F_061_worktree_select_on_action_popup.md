---
id: F-061
title: Select workTree from action popup
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
User can select the active worktree from the action popup. When the action popup is associated to a card, it reflects the worktree of that card (and also updates it). When the action popup is for the project agent, then the user can select the worktree on which to run the agent project wide.

## Current state

- The popup header contains the action selector, expand, and close controls in one row; it has no worktree control.
- Card worktree assignments are stored in frontmatter and included in card action contexts. The project-agent context has no worktree assignment.
- Electron uses a card's valid assignment only when an action has `needsWorkTree`. It rejects project contexts for such actions; actions without `needsWorkTree` run in the primary worktree.

## implementation details

- Add an accessible worktree icon/menu at the upper left, on the same row as the right-aligned expand and close buttons. Move the action selector to a second row.
- List only valid linked worktrees reported by Git, plus an unassigned option. Keep invalid card assignments visible with their existing error.
- In card context, initialize from the card assignment and persist changes through `updateCardWorktree`; keep the previous selection if saving fails.
- Disable linked worktrees reserved by another active card. Background cards do not reserve worktrees.
- Before persisting a card assignment, Electron creates a title-slug branch in the selected clean worktree from the opened project branch. Existing branches and dirty worktrees fail without changing the assignment.
- In project context, keep the assignment in renderer service state for the current opened-project session only. Reset it when the project closes or changes; do not write it to project files, config, or schedules.
- Project context can select any valid linked worktree, including one reserved by an active card, and does not prepare a branch.
- Use the effective assignment for action filtering, prompt preparation, and execution. Electron resolves it only when `needsWorkTree` is true, accepting card or project context; missing, invalid, or unavailable assignments fail before process start. Actions without `needsWorkTree` still run in the primary worktree.
- Disable assignment changes while an action is running. Report save and validation failures through `dialogService`.
- Test card persistence/error handling, session reset, popup layout and accessibility, project/card execution resolution, missing/invalid assignments, and unchanged primary execution for actions without `needsWorkTree`.

## acceptance criteria

- Card popup shows and updates the card's worktree assignment.
- Card popup disables worktrees reserved by another active card and prepares the selected worktree before saving.
- Project-agent popup keeps one worktree assignment for the current opened-project session and does not persist it.
- An action with `needsWorkTree` runs in the valid worktree supplied by its card or the project agent.
- An action with `needsWorkTree` cannot start without a valid assignment and shows the reason.
- An action without `needsWorkTree` runs in the primary worktree regardless of the displayed assignment.
- Worktree control is accessible, occupies the top toolbar row, and cannot change during execution.

## see also
