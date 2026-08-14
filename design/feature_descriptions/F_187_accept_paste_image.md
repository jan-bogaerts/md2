---
author: 
id: F_187
internalId: 030deac3-abb2-46e9-821c-c9d1db04502e
title: accept paste image
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__030deac3-abb2-46e9-821c-c9d1db04502e.json#conversation=agent-19c44ac5-590f-4419-99d3-d2d01d21f650
  - design/activity/card__030deac3-abb2-46e9-821c-c9d1db04502e.json#conversation=agent-dfb5e2f5-59f5-4cfd-afa4-46158e48a11a
policy:
branch: f_187_accept_paste_image
worktree: 1
---

allow pasting an image into a markdown editor.

## Current state

`MarkdownEditor` enables MDXEditor's image plugin, but its high-priority `MarkdownPastePlugin` handles only `text/markdown` and `text/plain`. An image-only clipboard event therefore has no application path that persists binary data and inserts a durable reference.

Existing card editors expose the active card path through `CardMarkdownDataSource`. The new-card editor uses a local Markdown buffer, but its destination folder is the configured working folder. Action prompt editors use the same shared editor but are outside this feature.

Storage commits already accept base64 files. `asset_paths.ts` validates same-folder image assets, and release and archive operations already move relative image references with their card. New-card cancellation currently clears only form state.

## implementation details

- Define a clipboard image as a binary clipboard item with a supported `image/*` MIME type. Copied HTML containing only a remote image URL remains normal Markdown/text paste behavior.
- Extend `MarkdownPastePlugin` with an optional asynchronous image-paste handler. Check image items before text, consume the event immediately, and leave read-only and action prompt editors unchanged when no handler is supplied.
- Add focused card-image operations in the data layer. Convert the clipboard file to base64, map its MIME type to a supported extension, generate a collision-safe bare file name, resolve its path with `resolveCardAssetPath`, and commit it beside the card. A bare file name contains no directory segments, so it cannot escape the card folder.
- Existing card editors derive the destination from the active card path. New-card drafts use the configured working folder; title changes do not affect that folder.
- Save the image before inserting `![pasted image](<file name>)` at the current selection. If saving fails, insert nothing and report the error through `dialogService`. If insertion fails after saving, delete the new asset and report any cleanup failure.
- Track paths saved for the current new-card draft in `projectSessionService`, which already owns card-creation state. Successful card creation clears this pending ownership without deleting files. Confirmed cancellation waits for any in-flight image saves, deletes every tracked asset, then resets and closes the dialog. If deletion fails, keep the draft open and report the error so cancellation cannot silently orphan an image.
- Reuse existing relative-image release and archive handling. Do not add another move format or compatibility mode.
- Add tests for clipboard routing, MIME and extension validation, collision-safe naming, base64 persistence, Markdown insertion after persistence, error cleanup, new-card cancellation cleanup, successful creation ownership transfer, read-only behavior, and exclusion from action prompts.

## acceptance criteria

- Pasting a supported clipboard image into an existing card editor saves the binary file beside that card and inserts a relative Markdown image reference at the selection.
- Pasting into a new-card editor saves the image in the configured working folder and inserts the same relative reference before the card exists.
- Creating that card keeps its pasted images. Confirming cancellation deletes all images pasted for that draft before the dialog closes.
- Failed persistence inserts no Markdown reference. Failed insertion removes the newly saved image. Cleanup failures are shown through `dialogService` and do not silently discard new-card state.
- Read-only editors and action prompt editors do not save clipboard images through this feature.
- Releasing or archiving a card moves its pasted images with it, so relative references continue to resolve.
- Focused unit and UI tests cover existing-card paste, new-card paste, cancellation, successful creation, failure paths, and excluded editor surfaces.
