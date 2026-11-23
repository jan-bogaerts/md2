---
author: 
id: B_351
internalId: 4beee834-4950-4286-868c-1f2cfb895e10
title: project initialization creates an f_0 file everywhere
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__4beee834-4950-4286-868c-1f2cfb895e10.json
policy:
after: ab825e36-710b-4c16-bd2c-59dad2825fb4
changedFiles:
  - app/src/App.test.tsx
  - app/src/components/shell/main_window.test.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/remarkable_import_toolbar_button.grouped.test.tsx
  - app/src/components/stats_view/stats_content.test.tsx
  - app/src/components/stats_view/stats_menu_tab.test.tsx
  - app/src/data/data_types.ts
  - app/src/data/electron_data_bridge.ts
  - app/src/data/project_session.service.test.ts
  - app/src/services/data/local_git_storage_service.node.test.ts
  - app/src/services/data/local_git_storage_service.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/github/github_storage_loader.ts
  - app/src/services/github/github_storage_loading.service.test.ts
  - app/src/services/github/github_storage_read_only.service.test.ts
  - app/src/services/github/github_storage_service.ts
  - app/src/services/github/github_storage_types.ts
  - app/src/services/github/github_storage_write_operations.service.test.ts
  - app/src/services/github/github_storage_writer.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_session_service.service.test.ts
  - app/src/services/project/project_session_service.ts
  - app/src/services/project/save_state_service.ts
  - app/src/services/stats/project_stats_service.node.test.ts
  - app/src/services/telemetry/telemetry_service.service.test.ts
  - app/src/services/test_support/data_service_test_support.ts
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
  - desktop/src/project/project_folder_creation.js
  - desktop/src/project/project_folder_creation.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
---

the project initialization seems to create F_0_MD².md files everywhere. this is not needed.

## Current state

Project-folder setup passes every missing configured folder to `StorageService.createProject()`. `ProjectLoading.createProject()` also uses that operation for the configured working folder. Local storage creates each directory and writes `README.md`; GitHub storage commits the same file. Git cannot store an empty directory, so the README makes each configured folder part of the repository.

Each generated README contains Markdown but no card frontmatter or card-style filename. `MarkdownParsingService` therefore assigns it fallback ID `F_0`, meaning the ID used for imported Markdown without an explicit card ID. The initializer does not create a file named `F_0`; generated `README.md` files appear in MD² as `F_0` entries. A README in the working-folder root is classified as an active card, while README files in other project folders are loaded as regular Markdown documents.

Configured folder paths already exist in `md2.config.json`. They do not need repository entries while empty: writing the first real file can create the path. Current local and GitHub loaders instead treat an absent configured working folder as an error, which sends the user back to folder setup. This loader requirement is why initialization creates placeholder files.

Explicit folder creation from the file tree is different. The user asked for that empty folder to exist in the repository, so its current `.gitkeep` behavior remains valid.

## implementation details

* Treat a configured folder with no repository entries as an empty folder. Local and GitHub project loading must return an empty file list instead of `missing-working-folder` when the configured working or project path is absent. Configuration, not a placeholder file, establishes that these paths are valid.
* Remove configured-folder creation from `ProjectSessionService.confirmProjectFolderSetup()`. Keep repository-file loading there because it is still needed to avoid overwriting existing default action files.
* Remove the `storage.createProject()` call from `ProjectLoading.createProject()`. Keep project activation, default action creation, token-usage file creation, configuration persistence, and telemetry unchanged. Those real files create their parent paths when needed.
* After both verified call sites stop using it, remove the folder-placeholder `createProject` operation from storage interfaces and local, remote-control, Electron bridge, and GitHub implementations. Remove `createMissingProjectFolders`, `PROJECT_README_TEMPLATE`, and their focused placeholder tests. Do not leave an unused compatibility operation.
* Keep manual `ProjectFileOperations.createFolder()` behavior unchanged. It continues to create `.gitkeep` because this command explicitly persists an otherwise empty user-created folder.
* Do not change Markdown parsing or fallback ID `F_0`. Existing user-created `README.md` files remain untouched and continue to load normally.
* Update focused project-session and project-loading tests to prove initialization makes no folder-placeholder commit. Update local and GitHub loading tests to prove absent configured paths load as empty. Keep tests showing existing default actions are not overwritten and real files still create their parent paths.

## acceptance criteria

* Initializing a local or GitHub project creates no `README.md`, `.gitkeep`, or other file solely to represent an empty configured folder.
* Opening a project succeeds when its configured working, archived, releases, or diagrams folder has no repository entries. Each absent path behaves as an empty folder.
* Opening initialized project shows no `F_0` entry caused by folder initialization.
* Creating the first real file under a configured folder creates that path locally or in the GitHub tree without a prior placeholder.
* Default actions, token-usage data, project configuration, folder selection, Git inclusion settings, and existing files keep current behavior.
* Excluding a local project folder from Git creates no placeholder that must later be untracked or removed.
* Explicitly creating an empty folder from the file tree still persists that folder with `.gitkeep`.
