---
author: 
id: B_212
internalId: fe5a5bae-110a-49e6-ae74-60ed197c5c9b
title: images in cards not shown
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__fe5a5bae-110a-49e6-ae74-60ed197c5c9b.json
policy:
after: ccff9568-68bb-468f-85e7-37d06bd37b59
branch: b_212_images_in_cards_not_shown
worktree: 2
---
On mibile when we open a card which has an image in it, we don't show the image itself properly, but some placeholder. need to show the image itself.

This is only on remote ( mobile) over websocket

## Current state

Card bodies reference images in two forms:

* **Relative image**: `![pasted image](<pasted-image-….png>)`. Written by image paste (`card_image_operations.ts`) and by copied attachments (`card_attachment_operations.ts`). The file sits beside the card; the path is relative to the card's folder.
* **Absolute file image**: `![name](<file:///C:/…/name.png>)`. Written by "original location" attachments (`absoluteFileUrl` in `attachment_workflow.ts`). The file may be anywhere on the desktop host's disk, also outside the project root.

`MarkdownEditor` (`app/src/components/editor/markdown_editor.tsx`) registers `imagePlugin()` without an `imagePreviewHandler`. MDXEditor 4.2.1 therefore uses the Markdown `src` as-is in an `<img>`. The browser resolves it against the page URL, not against the card or the desktop disk:

* Remote client page is `http://<desktop>:<port>/`, served by `RemoteControlService.handleStaticRequest` from the React build folder. A relative `src` requests `/pasted-image-….png` from that folder → 404. A `file:///` `src` is blocked from an `http` page, and the file is on another computer anyway.
* MDXEditor's image cache maps any failed load to its broken-image URI → the placeholder the user sees.
* Desktop renderer has the same gap for relative images (packaged page is `file://…/renderer/index.html`, dev page is the Vite URL). Only `file:///` images can load there, and only because the renderer runs on the same disk.

Image bytes already have a bridge path: `projectLoading.loadProjectAsset(path)` → storage `loadProjectAsset(project, path)` → desktop `project_files.loadProjectAsset`, which returns base64 + content type and refuses paths outside the project root. Action icons use it (`action_icon_resolver.ts`) and build a `data:` URI. GitHub storage implements it too.

Existing defect on that path: `RemoteControlStorageService.loadProjectAsset` sends params `[path]`, but the desktop dispatcher calls `loadProjectAsset(project, path)`. Over websocket the path lands in `project` and the call fails. Remote action icons from project files are broken by the same defect.

No bridge method reads an image outside the project root.

## implementation details

* **Image source resolver** (new module, e.g. `app/src/services/attachments/card_image_source.ts`): `resolveCardImageSource(cardPath, src)` returns a displayable `src`.
  * `http:`, `https:`, `data:`, `blob:` → unchanged.
  * `file:` URL → decode to absolute host path → `projectLoading.loadImageFile(path)` → `data:<contentType>;base64,<content>`.
  * Otherwise relative → decode URI escapes, join with `cardFolder(cardPath)` (`asset_paths.ts`), normalize `.` / `..` → `projectLoading.loadProjectAsset(path)` → `data:` URI.
  * Load failure, unsupported type, or storage without the needed method → return original `src`. MDXEditor shows its broken-image placeholder. No dialog: a missing image is card content, not an application error.
* **MarkdownEditor**: add optional `imagePreviewHandler?: (src: string) => Promise<string>` prop, pass to `imagePlugin({ imagePreviewHandler })`. Editors without it keep current behavior.
* **Card editors** pass a handler bound to the card path:
  * `CardBodyEditor` (board card) and `CardEditor` (list card): active document path from `CardMarkdownDataSource`.
  * `NewCardMarkdownEditor`: draft path `${workingFolder}/new-card-draft.md`, same folder pasted images are saved to (`CardImageOperations.saveForNewCard`).
  * Out of scope: action prompt, action editor, instruction editor, card commit diff panel, search card preview.
* **Remote param fix**: `RemoteControlStorageService.loadProjectAsset` sends `[project, path]`.
* **New bridge method `loadImageFile(filePath)`** for absolute file images, needed because the React client may run on another computer:
  * Desktop: function beside `loadProjectAsset` in `desktop/src/project/project_files.js`. Requires absolute path and an extension in `PROJECT_ASSET_CONTENT_TYPES`; returns `ProjectAsset` shape. No project root check (original-location attachments are outside the root by design).
  * Wire through `local_bridge_dispatch.js`, `preload.js` allowlist, `electron_data_bridge.ts`, `DataStorage` in `data_types.ts` (optional method), `LocalGitStorageService`, `RemoteControlStorageService`, `projectLoading.loadImageFile`. GitHub storage does not implement it.
  * Security effect: any websocket client can read any supported image file on the desktop host. Remote clients already have full project and agent control, so no new trust level; restriction to image extensions limits exposure.
* **Tests**
  * Resolver: relative, nested, `./`, `..`, URL-encoded, `file:///` Windows path, `http(s)`/`data:` passthrough, load failure → original `src`.
  * `RemoteControlStorageService`: `loadProjectAsset` and `loadImageFile` send correct params.
  * Desktop `loadImageFile`: returns base64 + content type; rejects relative path and unsupported extension.
  * Card body editor: image with relative `src` renders with resolved `data:` URI (mocked `projectLoading`).

## acceptance criteria

* On a remote client, opening a card with a pasted or copied relative image shows the image, not the placeholder.
* On a remote client, an original-location (`file:///`) image is loaded from the desktop host and shown.
* Desktop shows the same images for relative and `file:///` references.
* New-card editor shows a just-pasted image.
* Missing or unsupported image files show MDXEditor's broken-image placeholder without an error dialog.
* `http(s)` and `data:` images render unchanged.
* Card Markdown is not rewritten; `src` stays the stored relative or `file:///` value.
* Remote `loadProjectAsset` works over websocket (action icons from project files also load remotely).