---
author: 
id: F_116
internalId: 26fc69f5-78ff-4e8e-81a7-c458232db575
title: add copy path and relative path to context menu
status: ready
owner: 
affects:
agents:
  - design/activity/card__26fc69f5-78ff-4e8e-81a7-c458232db575.json#conversation=agent-35057c77-03c2-4f0f-9ba5-a916e31716bf
  - design/activity/card__26fc69f5-78ff-4e8e-81a7-c458232db575.json#conversation=agent-860e0546-b972-4188-98aa-0365f9e9ab59
policy:
after: a5f03c32-1395-498d-bbfd-10184c78a633
branch: f_116_add_copy_path_and_relative_path_to_context_menu
worktree: 3
---
for cards: add 2 context menu items to copy the absolute and relative (to repository) file path of the card.

## Current state

- Card tiles have one actions menu opened by either right-click or the three-dot button. It supports card actions, policy changes, opening, title editing, and deletion, but cannot copy either form of the card path.
- File-tree rows have a separate menu. Card rows are identified by matching the row path to a parsed card, but their menu also cannot copy paths.
- `card.path` is already repository-relative and uses forward slashes. Local projects also expose `project.rootPath`, the absolute repository directory; remote projects do not expose a local root path.
- Existing renderer code can write text through the browser clipboard API, and user-visible failures are reported through `dialogService`.

## implementation details

- Add reusable card-path menu items to both the card-tile menu and file-tree card-row menu. Because each existing menu is shared by right-click and its three-dot button, both opening methods receive the new items.
- Label the items `Copy path` for the absolute filesystem path and `Copy relative path` for the repository-relative path.
- Copy `card.path` unchanged for the relative value. Repository-relative means the path from the Git repository root, for example `design/feature_descriptions/F_116_add_copy_path_and_relative_path_to_context_menu.md`.
- For local projects, build the absolute value from required `project.rootPath` and `card.path`, using filesystem separators appropriate to the root path. For remote projects, where `rootPath` is absent, do not render `Copy path`; keep `Copy relative path` available.
- Show these items only for parsed cards in the file tree. Regular Markdown files, action files, and folders keep their current menus.
- Close the menu when either item is selected, then write the chosen value to the clipboard. Report clipboard failure through `dialogService` with a clear path-copy fallback message.
- Keep path copying in renderer code. It reads already-loaded card and project data and requires no Electron bridge, persistence, Git operation, or card-state mutation.
- Add focused tests for both menus, local and remote project visibility, exact copied values, non-card file-tree rows, and clipboard failure reporting.

## acceptance criteria

- In a local project rooted at `C:\repo`, copying the path of a card whose `card.path` is `design/F_116.md` writes `C:\repo\design\F_116.md` to the clipboard.
- Copying the relative path of that card writes exactly `design/F_116.md` in both local and remote projects.
- Card-tile and file-tree card menus expose both items for a local project, whether opened by right-click or the three-dot button.
- Card-tile and file-tree card menus expose only `Copy relative path` for a remote project; `Copy path` is absent.
- Regular Markdown files, action files, and folders do not receive card path-copy items.
- Selecting either item closes its menu. Clipboard failure shows a user-visible error and does not change card, project, or repository state.
