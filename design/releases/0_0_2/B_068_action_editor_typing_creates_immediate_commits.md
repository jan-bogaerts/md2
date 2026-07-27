---
id: B-068
title: action editor typing creates immediate commits
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 1f91d689-2427-4b67-a365-7696260a1106
---

## Problem

Every action-editor change updates the canonical draft. A private 500 ms timer then calls `ActionService.saveDefinition`, which reaches `DataService.persistActionFile` and calls `storage.commit` directly. With auto-push enabled, the commit is also pushed.

This path bypasses the configurable commit batcher required by [[F-002]]. A pause of 500 ms while typing can therefore create another commit. The behavior applies to all text-producing controls: label, description, command, output-rule regular expression, text applicability filters, phrase title, prompt, and phrase Markdown. Selects, switches, and list operations use the same direct persistence path for each interaction.

The implementation also splits save ownership across `ActionEditor`, `ActionService`, and `DataService`:

- `ActionEditor` owns a second save delay, request queue, revision tracking, retry, conflict handling, and unmount flushing;
- Markdown uses both live-edit and buffered-change callbacks solely to enter the action save path;
- the global pending-save indicator starts only when `storage.commit` begins, so it does not cover the editor debounce, queued saves, conflicts, or invalid dirty drafts;
- unmount starts an untracked, fire-and-forget save. Navigation does not await it, failures are hidden, and an invalid draft is dropped;
- a delayed unmount save can outlive the editor or project that issued it.

## Fix

- Use one action draft-to-persistence coordinator for every action field. React controls report draft changes; they do not own commit timing or persistence queues.
- Persist the latest valid structured action through the same configurable commit-batching policy used for other project files. Do not call `storage.commit` once per action-editor save.
- Keep local draft persistence separate from Git commit and push delivery. Repeated edits to one action replace the pending file content and produce one batched commit.
- Remove the private 500 ms commit policy from `ActionEditor` and respect `react.autoCommitDelayMs`.
- Give prompt and phrase Markdown the same draft semantics as structured text fields; do not maintain a special live-edit persistence route.
- Track dirty, invalid, queued, saving, failed, and committed states in the shared pending-save model.
- On tab close, project switch, window close, or app quit, flush or await the latest valid draft and its pending commit through the existing lifecycle-flush mechanism.
- Preserve an invalid dirty draft or require an explicit discard decision. Do not silently drop it.
- Surface close/flush failures and leave the file pending for retry.

## Edge cases

- Slow typing with pauses longer than the configured delay.
- Continuous typing while a previous persistence request is in flight.
- A valid draft becoming invalid, then valid again.
- Switching tabs or projects during the debounce or an in-flight save.
- Closing the app with a valid or invalid dirty action.
- Manual-push versus auto-push mode.
- Multiple edited project files sharing one commit batch.
- Web, remote-control, and Electron storage implementations.

## acceptance criteria

- Typing in any action text field does not create a Git commit after 500 ms.
- All action fields use one draft/save process; prompt and phrase Markdown have no separate commit behavior.
- Action files respect `react.autoCommitDelayMs` and are coalesced by path in the shared commit batcher.
- A normal typing session creates at most one commit per configured batch interval, with the latest valid action content.
- Auto-push runs per completed batch, not per field edit.
- Pending-save state covers dirty drafts, queued persistence, commits, failures, and required close flushing.
- Closing or navigating cannot silently lose a valid or invalid action draft, and flush failures remain visible and retryable.
- Tests exercise every text field category, repeated slow and fast typing, real commit counts, auto-push counts, navigation, project switching, and close flushing.

## see also

- [[F-002]]
- [[B-008]]
- [[B-052]]
- [[B-061]]
- `design\architecture\initial description\writings\action_editor.md`
