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
Allow the Electron app to register linked Git worktree folders for the open local repository, assign cards to them, run actions in either the card's worktree or the primary project worktree, and show worktree/agent state on each card.

## Git model and terminology
- **Primary worktree**: the repository folder currently opened by Electron. "Primary" describes the MD² folder, not necessarily a branch named `main`.
- **Linked worktree**: another folder created through `git worktree add` and registered in MD².
- **Card worktree**: the linked worktree assigned to a card.
- Git worktrees share one object database but normally check out different branches. Git does not automatically merge worktree branches, and normally prevents one branch from being checked out in multiple worktrees.
- MD² registers existing worktrees. Adding or deleting an entry does not run `git worktree add`, remove a folder, or delete a Git branch.

## Current state
- Electron opens one local Git root and stores it as `currentLocalProject`. File, action, agent, diff, schedule, commit and watch operations use that root.
- Commands and agents always run with the primary worktree as `cwd`; `{{rootProjectFolder}}` resolves to that path.
- Project config is saved to repository-root `md2.config.json`. No ignored local project file exists for machine-specific worktree paths.
- Card data comes from markdown frontmatter. No worktree assignment exists.
- `ProjectCardView` uses its lower-right avatar as an Agent conversations button and owns a conversation popover. The same conversation component is still used in text view, while conversation logs also support action history and running-agent state.
- Agent state currently distinguishes `running`, `completed`, and `failed`. No reliable `waiting for input` event or `done but unseen` acknowledgement exists.

## Implementation details

### Worktree registration and persistence
- Store the ordered folder list as a JSON array of folder-path strings in `.md2-worktrees.json` in the primary project root. Load it together with the project.
- Add `/.md2-worktrees.json` to the project root `.gitignore`. Create `.gitignore` when missing and append the entry when absent. Never stage or commit `.md2-worktrees.json`.
- Do not store the folder list in `md2.config.json`, Electron Store, or another registry.
- List position is identity: first folder is worktree `1`, second is worktree `2`, and so on.
- Store a card's one-based worktree index in card markdown frontmatter as `worktree: <number>`. A missing `worktree` field means the primary worktree.
- Parse `worktree` as a positive integer. Invalid values remain visible as card errors instead of falling back to the primary worktree.
- On add and project restore, validate with Git that the folder:
  - is a worktree root;
  - belongs to the same Git common directory as the primary worktree;
  - is not the primary worktree or an already registered folder; and
  - has a named branch suitable for integration, not detached `HEAD`.
- Load and validate `.md2-worktrees.json` during project loading. Invalid JSON fails project-local worktree loading with a clear error; a missing file means an empty list.
- Detect stale/moved folders when opening a project. Keep their list entries and show affected cards as invalid; do not silently run those cards in the primary worktree.

### Config UI
- Add a dedicated worktree list to Config > Project below the existing project values. This is an Electron-only control even though it appears in the Project tab.
- Show canonical folder paths in configured order.
- Show a trash button only while its row is hovered or keyboard-focused. Removing an entry only unregisters it. It must never delete the folder, worktree, branch, or commits.
- Put a `+` button at the bottom. It opens an Electron directory-selection dialog, validates the selection, then appends it.
- Cancelling the folder dialog changes nothing and shows no error.
- Removing an entry changes only the list. Do not rewrite card frontmatter assignments.
- Config-page Save writes the ordered folder list to `.md2-worktrees.json`; Cancel discards list additions/removals. Card assignment changes write the card's `worktree` frontmatter through the normal card save path.

### Card assignment and indicator
- Replace the lower-right Agent conversations button in board cards with a new `CardWorktreeIndicator` component.
- For an assigned linked worktree, show the one-based index stored by the card.
- Clicking the component opens an assignment menu containing Primary/unassigned plus every valid linked worktree with its number and folder path.
- Keep assignment available through keyboard navigation and expose a label containing card ID, assigned folder and agent state.
- When the stored index is outside the current list bounds, show the index in red with a tooltip explaining that the configured worktree does not exist.
- When the indexed folder is missing or is no longer a valid linked worktree, show the index in red with a tooltip containing the folder path and validation error.
- An invalid assignment remains selected and visible. Do not silently clear it or use the primary worktree.
- The component also renders aggregate card-agent state:
  - spinner: at least one agent is running;
  - distinct waiting state: at least one agent is waiting for user input;
  - distinct unseen state: the newest agent run completed or failed after the user last acknowledged it;
  - no state decoration: idle or latest result already seen.
- Do not infer waiting state from arbitrary stdout text. Electron agent adapters must emit an explicit waiting/resumed signal.
- Remove board-only conversation popover code: avatar/initial helpers, popover state and handlers, and conversation props passed only through `CardView`/`CardColumn` to `ProjectCardView`.
- Preserve `AgentConversationList` and its service/bridge/log model while text view still uses it. Preserve action-run history and the shell running-agents indicator. Broader conversation removal is outside this feature.

### Action definition and execution
- Extend action definitions with optional `runIn: "project" | "card"`. Omitted `runIn` means `project`, preserving current action behavior. Validate other values during action loading.
- Resolve `runIn` independently for main, `before`, `after`, and matched `on` actions. Scheduled actions use the same resolution.
- `runIn: "project"` runs with the primary worktree as `cwd`. For an assigned card, a successful run then transfers that run's changes to the card worktree.
- `runIn: "card"` requires card context and a valid card assignment, then runs with the card worktree as `cwd`. Missing assignment or non-card context fails clearly; do not fall back to the primary worktree.
- Resolve `{{rootProjectFolder}}`, file paths, agent logs, action history and diff metadata against the selected execution worktree.
- Send the card's worktree index over the renderer bridge. Electron resolves it against the loaded `.md2-worktrees.json` list and revalidates the selected folder before execution.
- Serialize action integration per repository so concurrent runs cannot mix change sets.

### Transfer from primary to card worktree
- This is a local Git transfer, not a remote push. Remote push behavior remains controlled by existing project push settings.
- Before a project-worktree action that must transfer changes, require both primary and card worktrees to be clean and record both starting `HEAD` values.
- After a successful action, commit any remaining action-created changes in the primary worktree with an MD²-generated action commit. Preserve commits created by the action itself.
- Cherry-pick, in order, only the primary commits created after the recorded starting `HEAD` into the card worktree. Do not merge unrelated primary branch history.
- If the action fails, do not transfer changes or reset user files. Report any remaining primary changes.
- If commit creation or cherry-pick fails, abort the in-progress cherry-pick, leave the card branch at its pre-transfer `HEAD`, keep primary commits intact, and show a conflict/error through `dialogService`.
- Refresh project/card status after transfer without changing which folder Electron treats as the primary worktree.

## Edge cases and failure modes
- Same repository but same checked-out branch: reject registration with Git's branch/worktree explanation.
- Folder belongs to another clone of the same remote: reject it; matching remote URLs do not mean a shared worktree repository.
- Worktree path is nested, moved, deleted, detached, locked or prunable: report exact invalid state and disable assignment/execution.
- Removing an entry shifts later indices because list position is the reference. Cards retain their stored number and resolve against the updated list.
- Stored index is zero, negative, non-integer or outside list bounds: show red indicator and block card-worktree execution.
- Indexed folder is missing or invalid: show red indicator and block card-worktree execution.
- Dirty primary or card worktree: block project-to-card transfer before action start.
- Card renamed or moved: retain its `worktree` frontmatter value.
- Action creates no changes: finish successfully without a commit or cherry-pick.
- Action creates untracked files: include them in generated action commit after clean-start validation.
- Action or another process changes `HEAD` concurrently: stop integration and report repository changed during run.
- Cherry-pick conflict: card worktree returns to pre-transfer state; primary work remains available for manual recovery.

## Testing implications
- Add Git-service integration tests using temporary repositories and real `git worktree add` commands: common-directory validation, distinct branches, detached worktrees, stale paths, clean checks, commit capture, ordered cherry-pick and conflict abort.
- Add Electron bridge tests for directory selection, index-to-path resolution, out-of-bounds rejection, restore validation and repository-level execution serialization.
- Add local-file tests for `.md2-worktrees.json`: project-load timing, ordered path persistence, missing file, invalid JSON and `.gitignore` creation/update.
- Add Config > Project tests for list display, hover/focus delete control, add/cancel, invalid selections, removal behavior, Save and Cancel.
- Add markdown/data tests for parsing, writing and preserving numeric `worktree` frontmatter.
- Add card tests for assignment menu, one-based display, red out-of-bounds/missing-folder states, error tooltips, accessibility labels and each agent-state decoration.
- Update card-view tests after removing board conversation props/popover. Keep text-view conversation tests.
- Add shared action-definition parity tests for `runIn`, plus action-runner tests for primary/card selection, missing assignment, chained actions and scheduled actions.
- Add regression tests proving a failed/conflicted transfer does not silently reset either worktree or retarget a card.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in both `app/` and `desktop/` during implementation.

## Acceptance criteria
- Electron users can add, view and unregister valid linked worktree folders from Config > Project using a native folder picker.
- Worktree folders are stored in project-root `.md2-worktrees.json`, loaded with the project, ignored by Git and absent from `md2.config.json`.
- Card assignments are stored as one-based `worktree` indices in card markdown frontmatter.
- Cards can be assigned to valid linked worktrees and show the correct one-based list number in the lower-right component.
- An out-of-bounds index or missing/invalid folder shows the stored index in red with an explanatory tooltip and cannot run card-worktree actions.
- Board cards no longer show or carry board-only Agent conversations button/popover code; text-view conversations and action logs still work.
- Card indicator represents running, waiting-for-input and completed/failed-unseen agent states once explicit events are available.
- Actions run from the worktree selected by `runIn`; card-scoped execution without a valid assignment fails visibly.
- Successful project-worktree actions transfer only their commits to the assigned card worktree. Conflicts leave the card worktree unchanged and preserve primary commits.
- No worktree folder, Git branch, commit or remote is deleted or pushed merely by editing registrations.

## Open decisions
- Define which agent adapters/protocol events mean `waiting for input` and `resumed`; current generic child-process output cannot provide this reliably.
- Define which user interaction acknowledges `done but unseen` and where that local timestamp/state is stored.
- Confirm whether removing the board conversation button should also remove conversation UI from text view. This description preserves text-view conversations because they still have verified call sites.

## see also
- `design\feature_descriptions\F_041_electron_local_folder_projects.md`
- `design\feature_descriptions\ready\F_005_card_view.md`
- `design\feature_descriptions\ready\F_010_actions.md`
- `design\feature_descriptions\ready\F_016_config.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
- `design\architecture\architectural_decisions.md`
