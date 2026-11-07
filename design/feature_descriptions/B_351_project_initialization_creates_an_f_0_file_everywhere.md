---
author: 
id: B_351
internalId: 4beee834-4950-4286-868c-1f2cfb895e10
title: project initialization creates an f_0 file everywhere
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4beee834-4950-4286-868c-1f2cfb895e10.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: b_351_project_initialization_creates_an_f_0_file_everywhere
worktree: 2
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
