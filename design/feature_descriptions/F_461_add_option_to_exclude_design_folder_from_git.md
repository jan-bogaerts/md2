---
author: 
id: F_461
internalId: f3b7a6f7-0cc4-4d30-994b-026f9d5d8092
title: add option to exclude design folder from git
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f3b7a6f7-0cc4-4d30-994b-026f9d5d8092.json
policy:
after: ba0c496e-89f0-4041-953e-958d2f53c23f
branch: f_461_add_option_to_exclude_design_folder_from_git
worktree: 2
---

We currently have the [commit_batcher.ts](app/src/data/commit_batcher.ts), it saves all files and commits them to git.

But, we sometimes don't want to commit the design folder and instead just keep it local. So we should add a configuration option (on project level) that allows the user to turn on/off if the design folder is committed or not.

This option should also be available when opening a project for the first time and we show the dialog for setting up the project folders. By default, the 'include in git' flag should be off, so the design folder should not be committed.

Also, when turned off, we need to add the folder to the git ignore list and remove it when turned on. This can perhaps be a bit of a tricky situation cause we need to make certain git doesn't trip up when we exclude a folder.

## Current state

The configured `projectFolder` is the design folder; it contains active cards, actions, diagrams, releases, and archives. `CommitBatcher` sends every queued project-file change through `StorageService.commit`. Local storage writes each file, stages its path, and commits it. Project setup also commits placeholder files and default actions. No code manages `.gitignore` or supports local-only project files.

`ProjectConfig` has no include-in-Git field. Existing projects therefore always include `projectFolder`. Folder setup collects only folder paths and runs for local and GitHub projects. `md2.config.json` stays at repository root and is committed separately from `projectFolder`.

## Implementation details

- Define “design folder” as configured repository-relative `projectFolder`. Add project config boolean `includeProjectFolderInGit` under Git settings.
- Existing configs that omit field resolve it to `true`, preserving current behavior. New local-project setup explicitly defaults it to `false`. GitHub and read-only projects always use `true`; do not show or apply option there.
- Add “Include project folder in Git” control to local folder setup and local project Git settings. Do not allow exclusion when `projectFolder` is empty because repository root cannot be treated as separate local-only folder.
- When local setting is `false`, `CommitBatcher` persistence writes project-folder changes to disk without staging, committing, or pushing them. Setup creates missing folders and default action files locally without attempting `git add` on ignored paths. `md2.config.json` remains committed.
- Make desktop host own `.gitignore` and Git-index changes. Serialize them through existing project mutation coordinator. Add normalized root-anchored entry for `projectFolder` inside uniquely labelled MD²-managed block when exclusion is enabled. Preserve every unrelated line, newline style, and existing `.gitignore` file. If file does not exist, create it. Never delete `.gitignore`, including when managed block was its only content.
- Before changing existing local project from included to excluded, check whether Git tracks any path below `projectFolder`. If so, show blocking confirmation explaining that MD² will remove folder from Git index but keep files on disk. Confirmation runs `git rm --cached` for folder, updates `.gitignore`, and commits config, ignore rule, and index removals. Cancel keeps previous setting and Git state; unrelated draft config changes may still save.
- If no project-folder path is tracked, exclusion needs no destructive confirmation; add ignore entry and save config.
- Changing setting back to `true` removes only MD²-managed project-folder entry from `.gitignore` and saves config. Do not delete `.gitignore`, stage project-folder contents, or commit unchanged local files. Later normal file changes may enter Git through existing commit flow.
- Report Git or file-edit failures through `dialogService`. Do not publish new config value in `configService` until host operation succeeds.
- Extend config, folder-setup, local bridge/storage, desktop project-file, and commit-batcher tests. Cover missing-field migration, local/GitHub visibility, setup defaults, confirmation accept/cancel, tracked-file removal without disk deletion, write-only batching, re-enable behavior, empty and absent `.gitignore`, preservation of unrelated ignore content, and failure handling.

## Acceptance criteria

- Existing project without field opens with “Include project folder in Git” on and keeps current Git behavior.
- New local project opens folder setup with option off. Confirming setup commits `md2.config.json`, adds project folder to `.gitignore`, and leaves all project-folder files local and untracked.
- GitHub and read-only projects neither expose nor apply local-only option.
- Disabling option for tracked project asks for confirmation before Git-index removal. Accepting removes tracked project-folder paths from index, keeps files on disk, adds ignore entry, and saves disabled value. Cancelling changes none of those items.
- Disabling option for untracked project adds ignore entry and saves disabled value without confirmation.
- While disabled, card, action, diagram, asset, release, and archive changes under `projectFolder` persist locally without Git commits or pushes.
- Enabling option removes only managed project-folder ignore entry and saves enabled value. It does not add or commit existing project-folder files.
- `.gitignore` remains present after every enable/disable transition. All unrelated content and formatting remain unchanged.
- Exclusion cannot be enabled when `projectFolder` is repository root.
- Any failed `.gitignore`, index, or config operation shows error and leaves application setting at last successfully persisted value.
