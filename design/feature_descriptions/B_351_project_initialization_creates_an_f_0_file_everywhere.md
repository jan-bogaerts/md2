---
author: 
id: B_351
internalId: 4beee834-4950-4286-868c-1f2cfb895e10
title: project initialization creates an f_0 file everywhere
status: design
owner: 
affects:
agents:
  - design/activity/card__4beee834-4950-4286-868c-1f2cfb895e10.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
---

the project initialization seems to create F_0_MD².md files everywhere. this is not needed.

## Current state

Project-folder setup passes every missing configured folder to `StorageService.createProject()`. `ProjectLoading.createProject()` also uses that operation for a missing working folder. Local storage creates each directory and writes `README.md`; GitHub storage commits the same file. The README exists only because Git cannot track an empty directory.

Each generated README contains Markdown but no card frontmatter or card-style filename. `MarkdownParsingService` therefore assigns it fallback ID `F_0`, meaning the ID used for imported Markdown without an explicit card ID. The initializer does not create a file named `F_0`; generated `README.md` files appear in MD² as `F_0` entries. A README in the working-folder root is classified as an active card, while README files in other project folders are loaded as regular Markdown documents.

Manual folder creation already uses an empty `.gitkeep` file. `.gitkeep` is a conventional non-Markdown placeholder that lets Git retain an otherwise empty directory.

## implementation details

* In local project-folder creation, replace generated `README.md` and `PROJECT_README_TEMPLATE` with an empty `.gitkeep` placeholder. Keep directory creation, duplicate-folder removal, existing-folder checks, ignored-folder handling, staging, and commit behavior unchanged.
* In `GithubStorageWriter.createProject()`, commit `<folder>/.gitkeep` with empty content for each requested folder. Keep validation, folder de-duplication, one-commit behavior, and commit message unchanged.
* Remove initializer-only README template exports and imports after both storage paths use `.gitkeep`.
* Do not change Markdown parsing, fallback ID `F_0`, configured folder calculation, default action creation, or project configuration persistence. Existing user-created `README.md` files remain untouched and continue to load normally.
* Update focused local and GitHub storage tests to assert empty `.gitkeep` files, no generated `README.md`, unchanged handling of existing folders, and no staging or commit for ignored local folders.

## acceptance criteria

* Initializing a local or GitHub project creates empty `.gitkeep` placeholders in missing configured folders and creates no placeholder `README.md` files.
* Opening initialized project shows no `F_0` entry caused by folder placeholders, including in working, archived, actions, releases, and diagrams folders.
* Existing folders and their files are not overwritten or given another placeholder.
* Ignored local folders are created on disk, but their `.gitkeep` files are not staged or committed.
* Tracked local folders and GitHub folders remain represented in Git after initialization.
* Default actions, project configuration, folder selection, and explicit user-created Markdown files keep current behavior.
