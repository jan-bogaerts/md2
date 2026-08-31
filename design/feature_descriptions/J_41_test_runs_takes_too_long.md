---
author: 
id: J_41
internalId: e2ffca78-6736-4ef9-ab31-224364a9ae4c
title: test runs takes too long
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e2ffca78-6736-4ef9-ab31-224364a9ae4c.json
policy:
after: 25d602ba-1743-4365-b35d-08224cd0b98e
branch: j_41_test_runs_takes_too_long
worktree: 1
changedFiles:
  - app/package-lock.json
  - app/package.json
  - app/src/components/actions/actions_no_mock.test.tsx
  - app/src/components/card_view/card_view_no_mock.test.tsx
  - app/src/components/config/config_no_mock.test.tsx
  - app/src/components/config/config_page.test.tsx
  - app/src/components/editor/editor_no_mock.test.tsx
  - app/src/components/project_workspace.test.tsx
  - app/src/components/shell/project/new_card_dialog_render.test.tsx
  - app/src/components/shell/shell_no_mock.test.tsx
  - app/src/components/text_view/text_view_no_mock.test.tsx
  - app/src/services/release_operations.service.test.ts
  - app/src/services/release_operations.test.ts
  - app/src/test/memory_storage.ts
  - app/src/test/node_setup.ts
  - app/src/test/service_setup.ts
  - app/src/test/test_window.ts
  - app/vite.config.ts
---

we have a serious issue on the test definitions. the full test for the react app takes over 3 minutes and just keeps running.

* app test :1.3s
* config: 10s
* actions: 37s
* card view 13s
* editor 5s
* shell: 38s
* text view: 22 s
* stat
* services.agents: 1.4s
* services.data: 1.6s
* services.project: 1.1s

we need to dramatically lower these numbers cause tests are taking too long. find out what the bottlenecks are and fix it or remove the tests