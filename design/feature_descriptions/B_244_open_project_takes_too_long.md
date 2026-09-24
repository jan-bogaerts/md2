---
author: 
id: B_244
internalId: be1030df-8a36-4969-99af-e22e8456579f
title: open project takes too long
status: ready
owner: 
affects:
agents:
  - design/activity/card__be1030df-8a36-4969-99af-e22e8456579f.json
policy:
changedFiles:
  - .tmp/b244_capture_trace.js
  - .tmp/b244_launch_electron.js
  - app/src/components/actions/run/trigger/action_entry_points.tsx
  - app/src/components/card_view/card_subscription_hooks.test.tsx
  - app/src/components/card_view/card_view.test.tsx
  - app/src/components/card_view/card_worktree_indicator.tsx
  - app/src/components/card_view/project_card_view.tsx
  - app/src/components/hooks/project_toolbar_snapshots.test.tsx
  - app/src/components/hooks/use_active_card_count.ts
  - app/src/components/hooks/use_project_loading.ts
  - app/src/components/overlay_lifecycle.test.tsx
  - app/src/components/shell/main_window.test.tsx
  - app/src/components/shell/main_window.tsx
  - app/src/components/shell/menu/agent_menu_controls.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/menu/main_toolbar.grouped.test.tsx
  - app/src/components/shell/menu/main_toolbar.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/components/shell/project_loading_indicator.tsx
  - app/src/components/shell/project_toolbar_menu.tsx
  - app/src/components/worktree_selector.tsx
  - app/src/services/agents/agent_integration.test.ts
  - app/src/services/agents/agent_integration.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/project/project_session_service.service.test.ts
  - app/src/services/project/project_session_service.ts
after: 67d4a581-6ded-4a41-a489-d079644e3e5b
---

see trace [Trace-open project.json](file:///C:/Users/janbo/Documents/dev/Trace-open%20project.json). Analyze the trace. it is taken while opening a project. this operation takes way way too long. most likely there is again a UI architecture violation where the UI keeps re-rendering while loading the project.

First tell me what is happening during the load, then make a proposal to improve.

## Current state

Trace covers 12.45 seconds. After project-open click, renderer main thread spends about 5.8 seconds in long tasks: uninterrupted JavaScript work lasting over 50 ms. Largest task lasts 4.53 seconds and contains a 3.93-second React render. Layout and paint use only about 74 ms combined, so browser drawing is not bottleneck.

Load chain is:

1. `ProjectSessionService` publishes loading state. `ProjectLoading.openProject` then loads config, token usage, actions, and working-folder files in sequence.
2. Config, session, project, persistence, and worktree events reach broad subscriptions in `AppMenu` and `useProjectToolbarMenuActions`. Each update rebuilds `menuPanel` and `menuTabs`; `MainToolbar` renders 13 times after click.
3. Root snapshot publishes 95 active cards. Each card mounts its visible controls plus closed card menu, two closed card dialogs, `WorktreeSelector`, its closed menu, and three closed worktree dialogs. Trace records 95 `CardDragContainer` renders, 190 `WorktreeSelector` renders, 371 MUI menu renders, and 846 MUI dialog renders. Development `StrictMode` causes expected double invocation, explaining many doubled counts.
4. Background conversation hydration updates 67 `CardWorktreeIndicator` instances because each indicator observes conversation data only to detect run completion. Those updates continue after board mount.
5. Full-project and repository-index loading continue in background and publish final project state.

## Implementation details

* In `project_card_view.tsx`, mount card action menu, archive dialog, and delete dialog only while each overlay is open. A closed overlay means a menu or dialog whose `open` value is false and which has no visible UI.
* In `worktree_selector.tsx`, mount worktree menu and only currently open worktree dialog. Preserve draft values required while an open dialog changes mode; closing may unmount its state.
* Move final-card-run worktree refresh from `CardWorktreeIndicator` into agent/worktree service integration. Trigger refresh when live card conversation state changes from at least one running conversation to none and card has assigned worktree. Initial persisted-conversation hydration must not trigger refresh. `CardWorktreeIndicator` then subscribes only to worktree fields it renders.
* Split `AppMenu` ownership by update scope. Project controls own project/session/persistence/worktree subscriptions; agent controls own desktop-config subscriptions; active dialog owns dialog state. Keep toolbar layout and unrelated controls stable when one scope changes. Do not pass recreated feature-specific JSX through `MainToolbar` props.
* Replace broad `useProjectState` use in project-menu actions with focused project reference and active-card-count snapshots. Repository-file, background-card, running-agent, and conversation-only changes must not rebuild toolbar.
* Keep existing staged load: working-folder cards become usable first; full project, repository index, instructions, and conversations continue in background. Do not add compatibility modes or reload project twice.
* Add focused render-isolation and overlay-lifecycle tests. Use a fresh development-mode performance trace with same project for timing verification.

## Acceptance criteria

* Opening traced project mounts no closed card or worktree menu/dialog component. Opening one overlay mounts only that overlay; closing it removes it.
* Initial conversation hydration does not rerender card worktree controls or request worktree refresh.
* Last live conversation finishing on worktree-assigned card requests one worktree refresh. Cards on primary worktree request none.
* Project, loading, persistence, and worktree changes rerender only toolbar controls that consume changed value. Conversation-only and background-file updates do not rerender `MainToolbar`.
* Working-folder board becomes interactive before background full-project and conversation loads finish. Open-to-interactive means time from confirmed project selection until board accepts pointer and keyboard input.
* Development-mode trace for same project has no project-open React task over one second and reduces open-to-interactive main-thread time by at least 50% from baseline captured before change.
* Project opening, card menus, archive/delete confirmation, worktree operations, branch controls, loading indicators, and background hydration keep current behavior.
* Focused app tests, `npm run typecheck`, and `npm run lint` pass.
