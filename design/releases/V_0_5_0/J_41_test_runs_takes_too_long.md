---
author: 
id: J_41
internalId: e2ffca78-6736-4ef9-ab31-224364a9ae4c
title: test runs takes too long
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__e2ffca78-6736-4ef9-ab31-224364a9ae4c.json
policy:
after: 3b6ae28a-dbbc-4229-be1b-f9b7ecd00fc1
changedFiles:
  - app/package-lock.json
  - app/package.json
  - app/src/components/actions/actions_no_mock.test.tsx
  - app/src/components/card_view/card_view_no_mock.test.tsx
  - app/src/components/config/config_no_mock.test.tsx
  - app/src/components/config/config_page.test.tsx
  - app/src/components/editor/editor_no_mock.test.tsx
  - app/src/components/project_workspace.test.tsx
  - app/src/components/shell/claude_rate_limit_status.test.tsx
  - app/src/components/shell/codex_rate_limit_status.test.tsx
  - app/src/components/shell/github_auth_toolbar_button.test.tsx
  - app/src/components/shell/keyboard_status.test.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/main_toolbar.test.tsx
  - app/src/components/shell/menu/menu.test.tsx
  - app/src/components/shell/menu/menu_components_no_mock.test.tsx
  - app/src/components/shell/menu/menu_select.grouped.test.tsx
  - app/src/components/shell/menu/menu_select.test.tsx
  - app/src/components/shell/menu/mobile_create_menu.test.tsx
  - app/src/components/shell/menu/project_name_label.test.tsx
  - app/src/components/shell/menu/section.test.tsx
  - app/src/components/shell/menu/tab.test.tsx
  - app/src/components/shell/mobile_layout.test.tsx
  - app/src/components/shell/mobile_main_window.test.tsx
  - app/src/components/shell/project/new_card_dialog_attachment.test.tsx
  - app/src/components/shell/project/new_card_dialog_render.test.tsx
  - app/src/components/shell/project/new_card_markdown_editor.test.tsx
  - app/src/components/shell/project/new_card_no_mock.test.tsx
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/remarkable_import_toolbar_button.test.tsx
  - app/src/components/shell/remote_connect_button.test.tsx
  - app/src/components/shell/remote_control_button.test.tsx
  - app/src/components/shell/remote_control_connection_info.test.tsx
  - app/src/components/shell/remote_control_status_indicator.test.tsx
  - app/src/components/shell/search/search_card_preview_dialog.test.tsx
  - app/src/components/shell/shell_connections_no_mock.test.tsx
  - app/src/components/shell/shell_controls_no_mock.test.tsx
  - app/src/components/shell/shell_no_mock.test.tsx
  - app/src/components/shell/split_layout.test.tsx
  - app/src/components/shell/status_bar.test.tsx
  - app/src/components/shell/theme_settings_dialog.test.tsx
  - app/src/components/shell/theme_toggle_button.test.tsx
  - app/src/components/shell/update_notification.test.tsx
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