---
author: 
id: F_253
internalId: feaf009d-ccf1-489b-bc6f-b3eca1746831
title: click on search selects and focuses card
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__feaf009d-ccf1-489b-bc6f-b3eca1746831.json
policy:
after: 933da3dd-6634-467f-bd86-e3205f22da5d
changedFiles:
  - app/src/components/project_workspace.test.tsx
  - app/src/components/project_workspace.tsx
  - app/src/components/shell/search/search_card_preview_dialog.test.tsx
  - app/src/components/shell/search/search_card_preview_dialog.tsx
  - app/src/components/shell/search/search_control.test.tsx
  - app/src/components/shell/search/search_panel.tsx
  - app/src/components/shell/search/search_results.tsx
  - app/src/services/project/workspace_navigation_service.node.test.ts
  - app/src/services/project/workspace_navigation_service.ts
---

When user clicks on the result of a global search query and he is on the boards view, one of these things should happen:

* card is on board (so still active, not archived or released): select it (visually show selection) and scroll into view
* card is released or archived: open a popup with the content, read only, but text remains selectable and can be copied

## Current state

`SearchPanel` receives each result as a `SearchMatch`, but `SearchResults` returns only its path. `SearchPanel.handleSelect` therefore sends every card and Markdown result through `workspaceNavigationService.open(path)`, regardless of current view or card location.

`ProjectWorkspace` handles that request by selecting the path in `workspaceViewService` and opening it in `openFilesService` without changing view mode. In cards view, active cards already render a selected border through `useIsWorkspacePathSelected`; no code scrolls selected card into view. An archived or released path selects no visible board card, and its hidden text-view tab opens while cards view remains visible, so user sees no content.

Search already separates active cards from background files. `SearchMatch.card` contains parsed header and body. Per current data model, only Markdown files under configured archived or releases folder that retain `header.internalId` are former cards; other background Markdown files remain regular documents.

Existing `CardBodyPopover` cannot show former cards unchanged: it resolves metadata and an editable document only from `snapshot.activeCards`. `MarkdownEditor` already supports local Markdown with `readOnly`, which prevents edits while leaving rendered text selectable.

Here, **focus card** means preserve visual selection and scroll card into nearest visible horizontal and vertical board area. It does not mean move browser keyboard focus or open card-details popup.

## Implementation details

* Change card-result selection callback to pass complete `SearchMatch`, not only `path`. At click time, re-resolve path against current project snapshot so a card moved or removed after search is not opened from stale result data.
* In cards view, branch by resolved result:
  * Active card: call a new single-purpose `workspaceNavigationService.revealCard(path)` operation, dismiss search, and close search control. Keep existing `open(path)` behavior for current call sites: app menu, conversation links, text-view action results, and non-card background documents.
  * Archived or released card: identify it by folder-boundary-safe comparison with configured `archivedFolder` or `releasesFolder` and require `header.internalId`. Dismiss results and open read-only preview; do not select workspace path or open text-view document.
  * Other background Markdown: keep current `open(path)` behavior. It is not an archived or released card.
* Extend `WorkspaceNavigationService` with granular `revealCard` event. `ProjectWorkspace` handles it because root workspace owns board layout: verify path is still in `snapshot.activeCards`, select path through `workspaceViewService`, select card's status column through `mobileCardViewService` on mobile, then scroll matching `[data-card-path]` element with `scrollIntoView({ block: 'nearest', inline: 'nearest' })` after layout updates. Keep cards view active. Report missing-card or missing-element failures through `dialogService`.
* Add `search_card_preview_dialog.tsx`. Give component one responsibility: show result ID, title, path, and body in MUI `Dialog`; render body with local `MarkdownEditor` using `readOnly` and no editing toolbar or attachment controls. Keep selectable/copyable browser text behavior. Put Close button in bottom-right action row and support Escape/backdrop close.
* Keep `SearchPanel` mounted while preview is open, like existing action-popup flow, so moving focus into dialog does not trigger search blur cleanup first. Closing preview also closes search control.
* Add focused tests:
  * `search_control.test.tsx`: active result requests card reveal; archived/released result opens read-only preview without workspace navigation; ordinary background result and non-cards view retain existing navigation.
  * `project_workspace.test.tsx`: reveal selects active card, preserves cards view, selects mobile column when required, and calls `scrollIntoView` with nearest alignment.
  * New preview test: ID/title/body render, editing controls are absent, content is read-only, and Close/Escape/backdrop dismiss it.

## Acceptance criteria

* While cards view is active, clicking active-card search result closes search, leaves cards view active, applies existing selected border to that card, and scrolls it into nearest visible board area horizontally and vertically.
* On mobile cards view, same click first shows card's status column, then selects and scrolls card into view.
* Active-result reveal does not move keyboard focus to card and does not open card-details popup.
* While cards view is active, clicking archived or released card result opens modal preview containing card ID, title, path, and rendered body. Preview has no editable fields, formatting controls, state controls, file actions, or agent actions.
* User can select and copy text from read-only preview. No card or file mutation occurs.
* Archived/released preview does not change workspace selection, create text-view tab, or change view mode. Closing by Close, Escape, or backdrop also closes search flow.
* Folder comparison matches configured folder itself and descendants, but not similarly prefixed sibling folders. Background Markdown without `internalId` is not treated as archived/released card.
* In text or stats view, and for ordinary background Markdown, result navigation keeps current behavior.
* If selected result no longer resolves to expected card when clicked, app reports clear error through `dialogService` and does not navigate to stale data.
