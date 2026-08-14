---
author: 
id: F_159
internalId: 13c372c3-d12e-4b88-9ee3-b987068aaa0e
title: improve treeview
status: ready
owner: 
affects:
agents:
  - design/releases/0_3_0/card__13c372c3-d12e-4b88-9ee3-b987068aaa0e.json#conversation=agent-a93cb7ac-5946-4972-8833-c9379f37c571
  - design/releases/0_3_0/card__13c372c3-d12e-4b88-9ee3-b987068aaa0e.json#conversation=agent-33e8c8a4-8cc9-4cb8-94bf-5aad66985939
policy:
after: 615b2a1f-55c2-4113-b1ac-589ae3474ae2
---

* too much spacing between items, we have large trees, this much space makes it unreadable
* collaps folders by default.

# Current state

`FileTreeView` renders a virtualized `react-arborist` tree. File rows are 34px high, branch rows are 30px high, and the tree has 12px top and bottom padding. Large trees therefore show few items at once.

`openByDefault` currently opens every branch when the tree mounts. Branches include status groups, regular folders, and configured special folders such as actions, releases, archived files, and the working folder.

# Implementation details

- Use 28px for file and branch row heights. Use 4px top and bottom tree padding. Keep the current 16px indentation.
- Remove the global `openByDefault` behavior. Provide initial open state by node ID: status groups start open; regular and special folders start closed.
- Apply defaults only when the tree first receives a node. User-opened or user-closed state must survive later project snapshots and tree-data rebuilds during the mounted session.
- Keep selection, file activation, folder toggling, virtualization, hover actions, context menus, creation, deletion, labels, colors, and tree construction unchanged.
- Update focused `FileTreeView` tests for compact row sizing, initial branch state, folder toggling, status visibility, and state retention after rerender.

# Acceptance criteria

- On first render, regular and special folders are collapsed, including the working folder.
- On first render, every status group is expanded when its ancestors permit it to be visible. Opening the collapsed working folder therefore reveals its expanded status groups and cards.
- File and branch rows are 28px high; tree content has 4px top and bottom padding.
- User can expand and collapse every branch with existing controls.
- A project snapshot update does not reset branch state while `FileTreeView` remains mounted.
- Selection, active-document highlighting, file opening, row actions, and virtualization keep current behavior.
- Focused file-tree tests pass independently; app unit tests pass.
