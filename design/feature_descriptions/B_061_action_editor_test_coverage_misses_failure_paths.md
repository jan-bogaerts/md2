---
id: B-061
title: action editor tests miss critical states and integrations
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: c4eddafe-d799-4d1c-80fd-a01f5df3c8ea
---

## Problem

Coverage has expanded for `ActionEditor`, definition fields, filters, and agent-capability fields, but persistence tests still mostly stop at `ActionService.saveDefinition` or mock `DataService.persistActionFile`. They encode the private 500 ms autosave timing without verifying the resulting Git commit and push counts or the configured commit-batching contract.

`ActionLinkListEditor` and `ActionOnRulesEditor` still have no focused test files. Current tests also miss invalid-draft close behavior, unmount-save failure, project switches during queued saves, external deletion, phrase identity/history after deletion, and the boundary between transient editor state and domain action publication.

## Required coverage

- `ActionEditor`: initial values, every action type, valid/invalid transitions, save failure, retry, status, prompt, and external reload.
- Auto-save: deferred/out-of-order requests, typing during save, no remount/focus loss, close/switch behavior.
- Persistence batching: fast and slow typing in every text-field category, configured delay, coalescing by action path, real storage commit count, and auto-push count.
- Lifecycle: invalid draft close, unmount failure, project switch during queued/in-flight persistence, and app-close flush completion.
- External changes: action deletion, delete/recreate, move, stale save echoes, and dirty-draft recovery.
- Phrase documents: stable identity, selection, and undo/redo history after add/delete/reorder and external reload.
- `ActionDefinitionFields`: type transitions clear only inapplicable fields and preserve applicable values.
- `ActionFilterEditor`: add/change/remove, descriptors, stale/custom values, duplicate keys, structured values.
- Link/rule editors: labels versus persisted ids, ordering, removal, unknown/stale selections, regex errors, cycles, empty-list errors.
- Capability fields/service: loading, errors, empty results, stale responses, agent/model changes, retired values.
- Creation/navigation: Run-tab command creates a valid file, publishes service state, switches to text view, opens/activates one tab, and reopens after project reload.
- Persistence parity: web, desktop local, and remote-control storage save identical canonical JSON.
- State ownership: selecting an editor tab does not mutate or publish transient state through `ActionDefinition`.

## Test rules

- Prefer `userEvent` and user-facing queries.
- Use real service behavior where publication/remount/persistence integration matters; mock only external provider/storage boundaries.
- Keep race tests deterministic with deferred promises/fake timers, not real sleeps.
- Add shared validator parity tests used by React and Electron.

## acceptance criteria

- Every new public component and significant UI state has focused tests.
- Each bug card B-048 through B-060 adds a regression test that fails before its fix.
- End-to-end component/service test covers create, edit, auto-save, service publication, tab activation, and reload.
- End-to-end persistence tests prove action typing follows the configured commit batch and does not commit or push per field edit.
- App and desktop test suites remain deterministic under normal parallel execution.
- `npm run lint`, `npm run typecheck`, and affected test suites pass.

## see also

- [[B-048]]
- [[B-052]]
- [[B-053]]
- [[B-068]]
- [[B-069]]
- [[B-070]]
- [[B-071]]
- [[B-072]]
- [[B-073]]
- `design\architecture\initial description\writings\action_editor.md`
