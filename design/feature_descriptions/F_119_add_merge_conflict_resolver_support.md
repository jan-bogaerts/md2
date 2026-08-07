---
internalId: 3373bf52-14c0-4cc7-8f7c-555c835af9a0
id: F_119
status: new
title: add merge conflict resolver support
after: 0ef8b9a6-ac40-4617-b077-17260b17a61c
agents:
  - design/activity/card__3373bf52-14c0-4cc7-8f7c-555c835af9a0.json#conversation=agent-dd3c8056-cd7b-4a3a-bbf8-c0276e0093a6
  - design/activity/card__3373bf52-14c0-4cc7-8f7c-555c835af9a0.json#conversation=agent-de1178a8-f7b3-4ad6-8982-12422ff6d844
---
* in config allow user to specify which external merge-conflict resolver tool to use.
* upon merge conflict: show dialog where user can go over every file that has issues. for every file, he can open the external tool or use an agent to solve it.
* user can also use an agent to resolve all merge conflicts
* if external tool is used, after close of external tool, user must flag the file as resolved manually.
* For the agent, it should be possible to assign an action to the ´resolve merge conflict type. Actions already have a filtering mechanisme, extend this.

## Current state

Worktree updates rebase a linked worktree onto the project branch. Worktree integration first rebases when needed, then squash-merges into the project branch. On a failed rebase, desktop immediately runs `git rebase --abort`; on failed integration, it hard-resets the project worktree to its checkpoint. React receives only an error, so it cannot list conflicted files or resume the interrupted operation.

Desktop config has an external editor command, and project config has a diff command, but neither defines a merge-conflict resolver. Action contexts support `card`, `file`, `folder`, and `project`; `appliesTo` matches their fields exactly. No conflict context, conflict prompt placeholders, resolver dialog, or bridge API exists.

## implementation details

- Add machine-local `desktop.mergeConflictResolverCommand`, defaulting to empty. Require `{{file}}`, resolved to the absolute conflicted file path; support `{{repository-folder}}`, resolved to the worktree containing the conflict. Empty config disables external-tool buttons and explains why.
- Add a desktop-owned, durable conflict session: persisted state for one paused Git operation. Store session ID, operation and phase, repository root, worktree index, conflicted repository-relative paths, pre-operation checkpoint, and integration metadata needed to finish history tracking, synchronization, and optional branch cleanup. Reject other worktree mutations against that repository until session ends.
- After a rebase or squash-merge command fails, query Git for unmerged index entries. If entries exist, keep Git state intact, persist a session, and return a conflict outcome instead of aborting. If none exist, retain current rollback and error behavior.
- Expose session load/change, resolver launch, rescan, mark-resolved, continue, and abort operations across local and remote-control bridges. App conflict service owns renderer state, emits scoped `EventTarget` changes, and supplies stable snapshots to the dialog through `useSyncExternalStore`.
- Open one resolver dialog automatically. Show every conflicted path and its current state. Per file, offer configured external tool, matching agent actions, and `Mark resolved`. Offer matching agent actions once more for all remaining files. Dialog body scrolls; Cancel and Continue remain in bottom-right action row.
- Launch external resolver in conflict repository and wait for its process to close. Closing tool does not resolve file. `Mark resolved` runs path-scoped `git add -A -- <path>`, then rescans unmerged entries. Launch or staging failure keeps file unresolved and reports through `dialogService`.
- Extend `ActionContextKind` and action-filter editor with `merge-conflict`. Action remains `type: "agent"`; an action becomes available here through `appliesTo.kind: "merge-conflict"`. Add `{{conflict-file}}` for one selected path and `{{conflict-files}}` for newline-separated remaining paths. Bind conflict context to active session so action runner uses paused operation's repository, including linked worktrees, and cannot redirect run to arbitrary path.
- After conflict agent finishes, rescan Git. Paths staged by agent disappear from unresolved list; edited but unstaged paths remain until user marks them resolved. Resolve-all agent receives every currently unresolved path.
- Disable Continue while Git reports any unmerged entry. For rebase, run non-interactive `git rebase --continue`; if later commit creates another conflict, refresh same session. During integration's preliminary rebase, finish rebase and resume squash step. During squash conflict, finish existing integration commit, activity tracking, linked-worktree synchronization, and requested cleanup only after resolution succeeds.
- Cancel aborts active rebase or resets squash integration to stored checkpoint, refreshes worktree state, clears session, and closes dialog. Project close aborts cleanly. Renderer reload restores active dialog; desktop restart reloads persisted session and verifies it against Git before allowing continue or abort. Ignore watcher updates for active conflicted paths, then reload affected files after continue or abort.
- Add desktop Git/session and command-launch tests; local and remote bridge tests; config validation/persistence tests; action context, filter, checkout, and placeholder tests; renderer service and dialog tests; and integration/update regression tests.

## acceptance criteria

- Conflict during explicit worktree update, integration's preliminary rebase, or squash integration opens resolver dialog instead of producing only generic failure.
- Dialog lists exactly Git's current unmerged paths. A later rebase conflict round replaces list with new current paths without losing original operation.
- Configured external resolver opens selected absolute file in correct repository. After tool exits, file remains unresolved until user chooses `Mark resolved` and staging succeeds.
- With empty resolver command, external-tool controls are disabled with explanation; agent resolution and Cancel remain usable.
- Only actions with `appliesTo.kind: "merge-conflict"` appear. Per-file run receives selected path; resolve-all run receives every remaining path; both execute in repository holding conflict.
- Agent completion triggers rescan and never assumes success. Unmerged or unstaged files stay visible; agent-staged resolved files disappear.
- Continue stays disabled while any unmerged entry exists. When none remain, Continue resumes exact interrupted Git flow and preserves existing integration history, synchronization, and cleanup behavior.
- Cancel restores repository to state before failed rebase or squash attempt, clears conflict session, and performs no later integration, history, synchronization, or branch-cleanup step.
- Resolver launch, agent, staging, continue, and abort failures keep recoverable session open and show clear error. Non-conflict Git failures retain current rollback and reporting.
- Renderer reload or desktop restart recovers active session without discarding user edits. Stale persisted session is cleared only after Git confirms no matching conflict remains.
