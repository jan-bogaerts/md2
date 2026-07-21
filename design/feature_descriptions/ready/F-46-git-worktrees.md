---
id: F-10
title: Git worktrees
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 85f226c7-ca58-4a90-a80b-f783769f0fb9
---

## Goal

Allow Electron to manage linked Git worktrees, assign cards to them, run `needsWorkTree` actions in the assigned worktree, and show worktree/agent state on each card.

## Git model and terminology

- **Primary worktree**: the repository folder currently opened by Electron. It is not necessarily a branch named `main`.
- **Linked worktree**: another folder created through `git worktree add`.
- **Card worktree**: the linked worktree assigned to a card.
- Git worktrees share one object database but normally check out different branches.
- Config can create and remove linked worktrees. Removing one deletes its checkout folder but retains its branch and commits.
- Action execution only uses linked worktrees reported by Git; it never creates one.

## Current state

- Worktree management, card assignment, and validation exist.
- The implemented action model uses `runIn: "project" | "card"` and can automatically transfer successful project-worktree changes to a card worktree.
- The action model must migrate to `needsWorkTree`; automatic commit/cherry-pick transfer must be removed without a legacy fallback.

## Implementation details

### Worktree discovery and identity

- Load linked worktrees directly from `git worktree list --porcelain`; do not persist a separate MD² worktree registry.
- Exclude the currently opened primary worktree from the linked-worktree list.
- Git list position is identity: the first linked folder is worktree `1`, the second is `2`, and so on.
- Store a card's one-based worktree index in frontmatter as `worktree: <number>`. A missing field means no assigned linked worktree.
- Invalid indices remain visible as card errors; never silently fall back.
- Detached, locked, and prunable worktrees remain visible with their exact invalid state.

### Config UI

- Show the worktree list in Config > Project as an Electron-only control.
- Display linked folder paths in Git order.
- `+` opens an Electron folder picker and runs `git worktree add <folder>`. Git checks out a matching branch or creates one from the folder name.
- Removing an entry requires confirmation and runs non-forced `git worktree remove`; Git rejects dirty or locked worktrees.
- Add and remove apply immediately and do not participate in Config Save or Cancel.

### Card assignment and indicator

- Use `CardWorktreeIndicator` in the lower-right of board cards.
- Show the stored one-based worktree index and allow assignment to Primary/unassigned or any valid linked worktree.
- Invalid/out-of-range assignments remain visible in red with the exact validation error.
- Preserve the aggregate card-agent states: running, waiting for input, completed/failed unseen, and idle/acknowledged.
- Do not infer waiting state from stdout text; an Electron adapter must emit it explicitly.
- Preserve conversation UI in text view, action history, and the global running-actions indicator.

### Action definition and execution

- Replace `runIn` with optional boolean `needsWorkTree`. Omitted or `false` runs in the currently opened project folder.
- When `needsWorkTree` is true and a card already has a valid assigned worktree, run in that worktree.
- When `needsWorkTree` is true, reject an unassigned card or a non-card context before starting a process.
- Resolve the card's one-based worktree value against Git's current linked-worktree list and reject missing, invalid, or unavailable entries with the exact validation error.
- Resolve `{{rootProjectFolder}}`, file paths, agent logs, action history, and diff metadata against the prepared execution worktree.
- The renderer sends only action id, context, and run-specific input. Electron reloads the definition, resolves `needsWorkTree`, and validates the selected worktree.
- Apply `needsWorkTree` to each linked action when it executes through the Electron `onBefore`/main/`on`/`onAfter` chain.
- Worktree preparation never commits, pushes, merges, cherry-picks, or transfers changes automatically. Users create explicit command actions for those operations, and ordinary action error handling reports their failures.

## Edge cases and failure modes

- A detached, locked, or prunable worktree reports its exact invalid state.
- Adding or removing a worktree can shift list indices; cards retain their stored values.
- A dirty or otherwise unusable worktree blocks preparation and shows the Git error.
- An unassigned card or non-card context cannot run an action that requires a worktree.
- Card rename or move retains its worktree assignment.
- An explicit commit, push, merge, or cherry-pick action reports its own process result; MD² adds no special integration behavior.

## Testing implications

- Add Git integration tests using temporary repositories and real `git worktree add`: discovery, creation, removal, branch retention, assignment, and detached worktrees.
- Add Config tests for display, immediate add, confirmed remove, and error reporting.
- Add card/data tests for worktree frontmatter, assignment, invalid states and agent-state decoration.
- Add shared action-definition tests for `needsWorkTree` and rejection of legacy `runIn`.
- Add Electron action-runner tests for primary/card execution, missing assignments, non-card contexts, invalid configured entries, linked actions, and schedules.
- Add regression tests proving action completion performs no automatic commit, push, merge, cherry-pick, or cross-worktree transfer.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in both `app/` and `desktop/` during implementation.

## Acceptance criteria

- Electron users can add, view, and remove linked worktrees from Config > Project.
- Git is the sole worktree source; card assignments use one-based indices from Git's current linked-worktree order.
- Invalid assignments remain visible, explain the problem, and cannot be used for execution.
- Actions without `needsWorkTree` run in the opened project folder.
- Actions with `needsWorkTree` use the card's valid assigned worktree and reject missing assignments or non-card contexts.
- Action execution does not create, remove, or assign worktrees.
- Git preparation errors are visible before process start.
- Action completion never performs automatic commit, push, merge, cherry-pick, or cross-worktree transfer.

## Open decisions

- Define which agent adapter events mean `waiting for input` and `resumed`.
- Define which interaction acknowledges `done but unseen` and where that local state is stored.

## see also

- `design\feature_descriptions\ready\F_010_actions.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
- `design\architecture\initial description\writings\running_actions.md`
