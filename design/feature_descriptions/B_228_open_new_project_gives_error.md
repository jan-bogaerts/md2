---
author: 
id: B_228
internalId: aea33400-48d0-4568-a66a-41df2c4f32f9
title: open new project gives error
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__aea33400-48d0-4568-a66a-41df2c4f32f9.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
branch: b_228_open_new_project_gives_error
worktree: 1
---
I opened an existing folder that contains a git repository. it showed the `project folders` dialog. after opening, we got this error:

`Agent conversation loading has not started for the current project`

not certain what it means

This is an older bug. Not certain if still valid. Needs investigation.

## Current state

The bug is still valid. The message comes from `AgentIntegration.requireProjectLoadToken` in `app/src/services/agents/agent_integration.ts`. A *project load token* is the number `ProjectState.beginProjectLoad` returns for each project load; `AgentIntegration` keeps it in `currentProjectLoadToken` so that a conversation load started for an older project load is discarded. `resetLoadedConversations` sets the token to `null`; `prepareProjectConversationLoad(token)` sets it. While it is `null`, `listProjectAgentConversations`, `ensureAgentConversationsForCard`, and `ensurePinnedConversationsLoaded` throw this error.

Path 1, opening a project (this report). `ProjectLoading.openProject` in `app/src/services/project/project_loading.ts`:

1. calls `resetAgentConversations` (token becomes `null`), then `replaceProject(project)`, so `dataService.getState().project` is no longer `null`;
2. awaits project config, token usage, actions, card files, card internal ID creation, and agent reference migration; some of these dispatch the data service `changed` event;
3. only then calls `prepareAgentConversationLoading(projectLoadToken)` and `hydrateActiveCardConversations`.

During step 2, `ProjectWorkspaceAvailability` (`useProjectReference`) already sees the project and mounts `AgentChatFab`. Its mount effect calls `dataService.listAgentConversations(PROJECT_CONTEXT)`, which throws, and the effect shows the error through `dialogService.error`. `DiagramView` has the same mount effect for `ROOT_DIAGRAM_CONTEXT` when the diagrams view is active. Opening a folder that needs config creation, ID creation, or reference migration makes step 2 longer, so the error is more likely.

Path 2, completing a release. `ReleaseOperations` calls `resetAgentConversations` after archiving project activity (`release_operations.ts`). In `DataService` this is `agents.resetLoadedConversations()`, so the token becomes `null` and nothing sets it again. Every later conversation load (card popup, pinned conversations popup, action popup defaults) throws the same error until the project is reopened. Active card conversations are also not reloaded.

## Implementation details

* Keep the fail-fast throw in `requireProjectLoadToken`; after this change it only signals a real ordering bug.
* Project conversation preload moves from components into `ProjectLoading`:
  * add `hydrateProjectConversations(): Promise<AgentConversation[]>` to `ProjectLoadingDeps`; `DataService` binds it to `agents.listProjectAgentConversations()`;
  * add a private `ProjectLoading.hydrateProjectConversations()` that awaits the dependency and reports a failure with `dialogService.error(error, { fallbackMessage: 'Could not load project agent conversations' })`, the message the FAB uses today;
  * call it with `void`, directly after `prepareAgentConversationLoading` and next to `hydrateActiveCardConversations`, in both `openProject` and `reloadCurrentProjectSnapshot`.
* Remove the mount effect that calls `listAgentConversations` in `AgentChatFab` (`app/src/components/agents/agent_chat_fab.tsx`) and in `DiagramView` (`app/src/components/diagram_view/diagram_view.tsx`). Both read project conversation state through existing subscriptions, which the service preload fills. Keep the rest of the `DiagramView` effect (`emphasis.start`, `service.open`).
* Release path: the `resetAgentConversations` dependency in `DataService.createReleaseOperationsDependencies` must keep conversation loading usable for the still-open project. After `agents.resetLoadedConversations()`, call `agents.prepareProjectConversationLoad(this.projectState.projectToken)`, then start the project conversation preload and active card hydration (same error reporting as above). Call sites of `resetLoadedConversations`:
  * `openProject` via `resetAgentConversations`: keep; the token is set later by `prepareAgentConversationLoading`.
  * `clearFailedProjectLoad` via `resetAgentConversations`: keep; no project is open, `null` is correct.
  * `AgentIntegration.reset` (from `DataService.init`): keep.
  * `ReleaseOperations` via its own `resetAgentConversations`: gets the new behavior described here.
* Edge cases:
  * A newer project load started while the preload runs: `canApplyLoad` already discards the stale result; the dialog may still report a failure of the stale load only if it throws, same as `hydrateActiveCardConversations` today.
  * User-triggered loads (card popup, pinned popup) in the window before the token is set remain fail-fast; cards are only clickable after the snapshot exists, which is just before the token is set.
* Tests:
  * `project_loading.test.ts`: `openProject` calls the project conversation preload after `prepareAgentConversationLoading`, never before; a rejected preload reports through `dialogService.error`.
  * `data_service.service.test.ts` (or a release test): after release reset, `listAgentConversations(projectContext())` resolves instead of throwing.
  * Regression: opening a project while `AgentChatFab` is mounted no longer shows the error.
  * Update `agent_chat_fab.test.tsx` and `diagram_view.test.tsx` cases that expect a `listAgentConversations` call or its error dialog on mount; that behavior moves to the service, so those expectations are stale.

## Acceptance criteria

1. Opening an existing folder with a git repository through the `project folders` dialog shows no `Agent conversation loading has not started for the current project` error, including folders that need a new config, card internal IDs, or reference migration.
2. Opening a project while the diagrams view is active shows no such error.
3. After a project opens, the project agent FAB shows the correct state for existing project conversations without any user action.
4. A failure while loading project conversations is shown once as `Could not load project agent conversations`.
5. After completing a release that archives project activity, opening a card's action popup, the pinned conversations popup, or the project agent popup works without reopening the project, and card conversation state is shown again.
6. Switching branch or reloading the project snapshot still loads project and card conversations.