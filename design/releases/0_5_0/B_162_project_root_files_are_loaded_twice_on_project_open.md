---
author: 
id: B_162
internalId: 1d9ff698-58aa-4f60-bc66-7ae73831af42
title: project root files are loaded twice on project open
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__1d9ff698-58aa-4f60-bc66-7ae73831af42.json
policy:
after: d3078abd-23e1-4c90-8b8e-6ee6459b005f
---

Opening a project reads every active card file from storage twice. The second read is redundant work on every project open, and it grows with the size of the working folder.

## Current state

`ProjectLoading.openProject` performs a fast first pass over the working folder root, so the board can render before the rest of the project is available:

- `app/src/services/project/project_loading.ts:234` calls `storage.loadProjectRoot(project, config.workingFolder)`. This returns the markdown files directly inside the working folder root, which are exactly the files that become `activeCards` (`isActive` is `isRootWorkingFolderFile`, see `app/src/services/data/markdown_parsing_service.ts:529`).
- `app/src/services/project/project_loading.ts:236` publishes them through `replaceProjectFiles`.
- `app/src/services/project/project_loading.ts:248` then starts `loadFullProjectInBackground` without awaiting it.

`loadFullProjectInBackground` loads the remainder of the project:

- `app/src/services/project/project_loading.ts:550` calls `storage.loadProject(project, projectFolder)`.
- `projectFolder` (`design`) is an ancestor of `workingFolder` (`design/feature_descriptions`), so this result contains the working folder root files again, in addition to the released, archived and other project files that the first pass did not load.

Every active card file is therefore read, transferred and parsed twice per project open: once by `loadProjectRoot` and once by `loadProject`.

The second copy is then discarded for those paths. `loadFullProjectInBackground` builds `nextFiles = mergeFiles(importedFiles, remainingFiles)`, and `mergeFiles(current, updates)` lets `updates` win (`app/src/services/data/data_service_context.ts:37`). `remainingFiles` is the already loaded in-memory set, so the in-memory copy overrides the freshly read one for every path present in both. `mergeBackgroundProjectFiles` is documented as adding files discovered by the full load "without replacing cards already owned by the root snapshot" (`app/src/services/project/project_state.ts:104`), which confirms the intent: the second read of those paths is not wanted, only tolerated.

The cost is paid in full regardless: storage round trip, file content transfer, `replaceCurrentContentHashes` hashing and `reconcileCards` parsing over the duplicated files.

## Required behavior

- A project open reads each active card file from storage exactly once.
- The staged load keeps its current user-visible behavior: working folder root files become available first, the rest of the project follows in the background without blocking.
- The set of files present after the background load completes is unchanged.

## Implementation details

- The background load must not re-read what the root pass already loaded. Restrict `loadFullProjectInBackground` to the project files outside the working folder root, rather than loading the whole project folder and discarding the overlap afterwards.
- This needs a storage-level way to express "project folder except the working folder root". `StorageService.loadProject` currently takes a single folder. Either add an exclusion parameter, or add a dedicated call for the non-root remainder. The chosen shape must be implemented for every storage backend, including `RemoteControlStorageService`, since remote clients run the same loading code.
- If the storage layer cannot express the exclusion, the second-best option is to filter before the expensive work rather than after: drop the overlapping paths from the `loadProject` result as soon as it arrives, so hashing and card parsing never see them. This removes the parse and hash cost but not the transfer cost, and should be treated as a fallback.
- Do not change the merge direction in `mergeFiles(importedFiles, remainingFiles)`. In-memory content must keep winning over the freshly read copy, because in-memory content may hold changes that are not on disk yet.
- `reloadCurrentProjectSnapshot` (`app/src/services/project/project_loading.ts:352`) has the same shape but is out of scope here. It has a single production caller, the card separator migration at `app/src/services/project/project_loading.ts:304`, where a full re-read after a bulk rename is deliberate.

## Acceptance criteria

- Opening a project issues exactly one storage read per active card file. A test that counts `loadProjectRoot` and `loadProject` calls and inspects the returned paths shows no path present in both results.
- After the background load completes, the project snapshot contains the same active, released, archived and other project files as before the change.
- Working folder root files are still shown before the background load finishes.
- Files that only the background load discovers, including released and archived cards, are still added to the snapshot.
- In-memory content still takes precedence over storage content for paths that exist in both the root pass and the background pass.
- Remote-control storage follows the same single-read behavior as local storage.
