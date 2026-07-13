---
id: B-061
title: action editor tests miss critical states and integrations
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Current coverage has three `ActionEditor` tests and two capability-service tests. New filter, link-list, output-rule, and capability-field components have no focused tests. Existing tests mock successful save and do not exercise service publication/remount behavior, real persistence, stale requests, or end-to-end create/edit/reopen flow.

This allowed data-loss, capability, validation-routing, and structured-control defects to pass 779 app tests.

## Required coverage

- `ActionEditor`: initial values, every action type, valid/invalid transitions, save failure, retry, status, prompt, and external reload.
- Auto-save: deferred/out-of-order requests, typing during save, no remount/focus loss, close/switch behavior.
- `ActionDefinitionFields`: type transitions clear only inapplicable fields and preserve applicable values.
- `ActionFilterEditor`: add/change/remove, descriptors, stale/custom values, duplicate keys, structured values.
- Link/rule editors: labels versus persisted ids, ordering, removal, unknown/stale selections, regex errors, cycles, empty-list errors.
- Capability fields/service: loading, errors, empty results, stale responses, agent/model changes, retired values.
- Creation/navigation: Run-tab command creates a valid file, publishes service state, switches to text view, opens/activates one tab, and reopens after project reload.
- Persistence parity: web, desktop local, and remote-control storage save identical canonical JSON.

## Test rules

- Prefer `userEvent` and user-facing queries.
- Use real service behavior where publication/remount/persistence integration matters; mock only external provider/storage boundaries.
- Keep race tests deterministic with deferred promises/fake timers, not real sleeps.
- Add shared validator parity tests used by React and Electron.

## acceptance criteria

- Every new public component and significant UI state has focused tests.
- Each bug card B-048 through B-060 adds a regression test that fails before its fix.
- End-to-end component/service test covers create, edit, auto-save, service publication, tab activation, and reload.
- App and desktop test suites remain deterministic under normal parallel execution.
- `npm run lint`, `npm run typecheck`, and affected test suites pass.

## see also

- [[B-048]]
- [[B-052]]
- [[B-053]]
- `design\architecture\initial description\writings\action_editor.md`
