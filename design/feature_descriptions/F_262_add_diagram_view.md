---
author: 
id: F_262
internalId: 3331f545-2396-4bb7-b421-14107e79a0d8
title: Add diagram view
status: ready
owner: 
affects:
agents:
  - design/activity/card__3331f545-2396-4bb7-b421-14107e79a0d8.json
policy:
after: 3509c194-adbf-4e1c-ad64-6aa9560354b4
branch: f_262_add_diagram_view
worktree: 1
changedFiles:
  - app/src/components/actions/run/popup/card_action_popup_host.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/project_workspace.tsx
  - app/src/components/project_workspace_availability.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/mobile_main_window.grouped.test.tsx
  - app/src/components/shell/mobile_main_window.tsx
  - app/src/data/action_context.node.test.ts
  - app/src/data/action_context.ts
  - app/src/data/action_placeholders.ts
  - app/src/data/data_types.ts
  - app/src/services/actions/action_text.node.test.ts
  - app/src/services/actions/action_text.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/diagrams/diagram_index.node.test.ts
  - app/src/services/diagrams/diagram_index.ts
  - app/src/services/diagrams/diagram_svg_sanitizer.test.ts
  - app/src/services/diagrams/diagram_svg_sanitizer.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/workspace_view_service.ts
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/action/action_text.js
  - desktop/src/actions/action/action_text.test.mjs
---
* Add toggle to app menu bar, before stats-view toggle. When clicked, shows diagram view
* Diagram view shows:
  * Svg component, which shows the currently active, clickable svg. Initially empty
  * Breadcrumb path for digging into the diagram and going back
  * Action popup with diagram actions.
* Initial diagram actions need to be of type ´root´.
* for digging into a diagram, we show of type ´child´. This allows us to pass in a value for ´parent-node´ placeholder when ´child diagram actions´ are triggered
* Action popup works as normal, so prompt prefilled.
* After user has run action, it has created an svg file and the action can report where the file is.
* We store a json in the design folder that keeps track, per root diagram action:
  * a list of svg files (perhaps extra props)&#x20;
  * Per svg, a list of child actions that were run with for each action again a list of svgs and child actions
* This json is loaded first time diagram view  is opened
* Last location (breadcrumb path) is saved in json and restored
* First breadcrumb represents root, next are the labels that user clicked on, which become input for the child diagram actions
* Action popup is like project popup, with floating fab button
  * Closes automatically when diagram is ready.&#x20;
  * If existing diagram can be loaded in breadcrumb, by clicking on svg and upon load, action popup remains closed
* when user clicks on a clickable array in the svg (an object or connection), a context menu opens:
  * containing all the child diagram-actions that can be run on this item and all the diagrams that have already been rendered for this label
  * when user clicks on a menu item:
    * either the action popup opens with the selected diagram-action enabled and the input contains prompt where placeholders have been replaced.
    * or the diagram is shown & breadcrumb is added to breadcrumb path.

Also see F\_246, almost implemented.

## Current state

Workspace view supports `cards`, `text`, and `stats`. App menu has Board, List, and Stats toggles; `ProjectWorkspace` mounts each surface and mobile layout treats Stats as the only full-workspace view. No diagram view, breadcrumb, diagram state service, or diagram-specific action FAB exists.

F\_246 infrastructure is implemented: actions support `diagram` context with `root` and `child` types; project config provides `diagramsFolder` and `diagramFooter`; `{{diagram-file}}` resolves to a generated SVG path; and action results expose that repository-relative path. Current default footer does not tell agents how to mark clickable SVG elements. `{{parent-node}}` is not supported.

Storage can load repository text and SVG assets, but no versioned diagram index exists. Existing SVG handling renders files as isolated assets or sanitizes small action icons; neither path provides safe inline SVG interaction.

## implementation details

* Add `diagrams` to `WorkspaceViewMode` and add Diagrams toggle immediately before Stats in desktop and mobile app menus. Mount `DiagramView` beside existing view surfaces. Treat Diagrams like Stats in mobile navigation visibility and card-action popup visibility. Hide project-agent FAB while Diagrams is active and render diagram-action FAB in its place.
* Add project-bound `DiagramViewService` as owner of loaded diagram records, global active path, popup state, current SVG, loading/error state, and persistence. Components subscribe through `useSyncExternalStore`; they only render and forward user actions. Bind and clear service with project lifecycle. Load index lazily on first Diagram view activation.
* Store index at `<resolved diagramsFolder>/diagram-view.json`; default path is `design/diagrams/diagram-view.json`. Use versioned normalized JSON: `roots` groups root diagram IDs by root action ID; each diagram record has generated stable ID, action ID, label, repository-relative SVG path, and optional parent `{ diagramId, itemId, itemLabel }`; `activePath` is one global ordered list of diagram IDs. Path identifies persistence location, never diagram identity. Missing index means empty state. Malformed data or broken parent chains show error and are not overwritten.
* A completed root action creates root record and replaces `activePath` with its ID. A completed child action creates record under selected parent diagram/item/action and appends its ID. Multiple runs remain available. Before recording result, load returned `diagramPath`, require it to be inside resolved diagrams folder, parse and sanitize valid standalone SVG, then persist SVG and updated index together. Only after persistence succeeds show diagram and close popup; on failure keep prior diagram and popup open, then report through `dialogService`.
* Extend diagram action context with `diagramId`, `diagramItemId`, and `parentNode`. `parentNode` means clicked element's `data-diagram-label` value. Add `{{parent-node}}` to supported prompt placeholders and editor insertion choices; resolve only for `child` diagram context with non-empty `parentNode`, otherwise fail clearly. Include diagram and item IDs in child action-context identity so runs on different items do not share popup/run state; existing context identities keep current behavior.
* Change default `diagramFooter` to: `Use the diagram skill. Create standalone SVG output and save it to {{diagram-file}}. For every drill-down item, set unique data-diagram-id and data-diagram-label attributes, set tabindex="0", and set role="button". Do not include scripts, event-handler attributes, foreignObject, links, or external resources.` Keep footer replaceable and injected exactly once. Validation still requires `{{diagram-file}}`; custom footer owns its complete generation contract.
* Parse SVG as XML and render only sanitized inline SVG. Remove scripts, `foreignObject`, animation, event-handler attributes, links, external references, CSS imports, and CSS `url()` values. Preserve safe SVG presentation, ARIA, `tabindex`, `role`, `data-diagram-id`, and `data-diagram-label`. Reject duplicate interactive IDs. Decorative elements may omit diagram data attributes. Never insert unsanitized agent output into DOM.
* Handle pointer activation and Enter/Space through SVG-container event delegation. An interactive element must contain non-empty `data-diagram-id` and `data-diagram-label`; app supplies missing accessible name from label. Open context menu with two sections: matching `child` diagram actions and saved child diagrams for selected parent diagram/item. Selecting action opens `ActionPopup` with action preselected and prepared prompt; selecting saved diagram changes `activePath` without opening popup.
* Diagram FAB opens normal `ActionPopup` with `diagram`/`root` context, so only root diagram actions appear. Subscribe to terminal run results for exact diagram context and consume successful `diagramPath`; cancelled, failed, or pathless results do not change index or close popup.
* Render Back button, breadcrumb row, SVG viewport, loading/error/empty states, and diagram FAB. First crumb uses root action label; later crumbs use clicked item labels. Back removes one path entry and is disabled at root. Clicking crumb truncates path. Every navigation change persists global `activePath`; reopening project restores exact last valid SVG. Missing SVG shows unavailable state while keeping breadcrumbs usable for return navigation.
* Add focused tests for config default, `parent-node` resolution/errors, context identity, index parsing/serialization and configured path, lazy load, global-path restore, repeated root/child runs, atomic failure behavior, SVG sanitization and keyboard activation, context-menu contents, popup selection/closing, breadcrumb navigation, menu order, desktop/mobile visibility, and unchanged card/text/stats/project-action behavior. Run affected app and desktop tests plus both linters.

## acceptance criteria

* App menu shows Board, List, Diagrams, Stats in that order. Selecting Diagrams shows full diagram surface on desktop and mobile without card/file navigation or card-action popups.
* First Diagram view open loads `<projectFolder>/<diagramsFolder>/diagram-view.json` once. Missing file produces empty state. Invalid index reports error without replacing file.
* Default footer tells agent where to save standalone SVG and how to mark accessible clickable items with unique `data-diagram-id` and `data-diagram-label`. Custom footer replaces default completely and remains appended exactly once.
* Root FAB lists only root diagram actions. Clicked SVG item menu lists matching child actions and every saved child diagram for same parent diagram/item. Child prompt resolves `{{parent-node}}` to clicked label.
* Successful diagram run is shown only after returned SVG is safely loaded, sanitized, and stored in index. Popup then closes. Failed, cancelled, pathless, unsafe, missing, or unpersisted output leaves current diagram unchanged and reports error.
* Agent-generated scripts, event handlers, `foreignObject`, links, external resources, animation, CSS imports, and CSS URL loads cannot execute or load. Safe SVG styling and accessible pointer/keyboard activation still work.
* Root and child runs remain in versioned tree after restart. Global active path restores exact last diagram. Breadcrumb and Back navigate existing records without reopening action popup; Back is disabled at root.
* Index and every accepted SVG path remain inside resolved diagrams folder. Stable diagram IDs identify records; repository paths are used only for loading and persistence.
* Focused app and desktop tests pass; app and desktop lint pass.
