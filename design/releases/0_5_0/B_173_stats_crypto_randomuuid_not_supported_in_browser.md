---
author: 
id: B_173
internalId: d9aa7d07-b618-4b83-9802-799c88174fb5
title: stats crypto randomUUID not supported in browser
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__d9aa7d07-b618-4b83-9802-799c88174fb5.json
policy:
after: be9b4114-07cb-48b0-a79f-68654ced052e
---
Apparently the stats view somewhere uses `crypto.randomUUID` . When we run the app in a browser (ex through websockets), we get this error: crypto.randomUUID is not a function

this needs to be fixed. we have had this before. perhaps we can make a note somewhere that we shouldn't use the crypto lib in the react app?

## Current state

`crypto.randomUUID()` only exists in **secure contexts** (https, or `localhost`). The remote-control server serves the app over plain `http://<lan-ip>:<port>`, which is not a secure context. There `crypto` is defined but `crypto.randomUUID` is not, so the call fails with `crypto.randomUUID is not a function`. `crypto.getRandomValues` stays available in insecure contexts, which is why library-based UUID generation keeps working.

The repository already fixed this once. [app/src/data/uuid.ts](../../app/src/data/uuid.ts) exports `generateUuid()`, backed by the `uuid` package (v14, `app/package.json`), and six call sites use it (`action_definition_writer.ts`, `action_service.ts`, `markdown_parsing_service.ts`, `action_phrase_editor_state.ts`).

Two renderer call sites were missed and still call the native API directly:

* [app/src/services/stats/project\_stats\_worker\_client.ts:87](../../app/src/services/stats/project_stats_worker_client.ts#L87) — `calculateActivityStatsOutsideMainThread` builds `calculationId` with `crypto.randomUUID()`. This runs on every stats calculation, before the desktop/browser branch, so it throws in the browser regardless of which backend would have been used. This is the reported crash.
* [app/src/services/data/card\_image\_operations.ts:68](../../app/src/services/data/card_image_operations.ts#L68) — `createAvailablePastedImagePath` defaults its `createIdentifier` parameter to `crypto.randomUUID()`. Same crash, not yet reported, triggered when an image is pasted into a card in the browser.

Nothing prevents a third occurrence: `app/eslint.config.js` has no rule against the native API, and `design/CODEMAP.md` does not mention the secure-context constraint. `desktop/` call sites are out of scope — they run in Node, where `crypto.randomUUID` is always present.

## Implementation details

1. `app/src/services/stats/project_stats_worker_client.ts` — import `generateUuid` from `../../data/uuid` and replace `crypto.randomUUID()` at line 87 with `generateUuid()`. The value is an opaque correlation id passed to `storage.calculateActivityStats` / `cancelActivityStatsCalculation`; format is unchanged (UUID v4), so the desktop side needs no change.
2. `app/src/services/data/card_image_operations.ts` — import `generateUuid` from `../../data/uuid` and change the `createIdentifier` default to `() => generateUuid()`. The injectable parameter stays, so existing tests that pass their own identifier generator are unaffected.
3. `app/eslint.config.js` — add to `projectRules`:

```js
'no-restricted-properties': ['error', {
  object: 'crypto',
  property: 'randomUUID',
  message: 'Not available in insecure browser contexts (remote control over http). Use generateUuid() from src/data/uuid.',
}],
```

The config only applies to `app/**/*.{ts,tsx}`, so `desktop/` and `shared/` keep using the native API.
4\. `design/CODEMAP.md` — add one bullet under `## Gotchas / don't-touch`: the renderer also runs over plain http via remote control, therefore secure-context-only APIs (`crypto.randomUUID`, and by extension `crypto.subtle`) must not be used in `app/`; use `generateUuid()` from `app/src/data/uuid.ts`.
5\. Tests — no new UUID unit test is needed; [app/src/data/uuid.node.test.ts](../../app/src/data/uuid.node.test.ts) already covers generation when `randomUUID` is unavailable. Note that `app/src/components/actions/editor/action_phrase_editor_state.node.test.ts:15` spies on `crypto.randomUUID`; it passes only because the `uuid` package delegates to the native API when it exists. That test is pre-existing and stays untouched unless it breaks.

## Acceptance criteria

* Opening the stats view in a browser served over plain http (remote control, e.g. from a phone on the LAN) renders the stats without the `crypto.randomUUID is not a function` error.
* Pasting an image into a card in that same browser session produces a uniquely named image file without error.
* `grep -rn "crypto.randomUUID" app/src` returns no hits outside test files.
* `npm run lint` in `app/` fails with the new rule when `crypto.randomUUID` is reintroduced in `app/src`, and passes on the fixed tree.
* `npm run typecheck` and the existing vitest suite pass unchanged.
* Stats calculation in Electron still cancels correctly: aborting a running calculation reaches `cancelActivityStatsCalculation` with the same id that started it.
* `design/CODEMAP.md` documents the secure-context constraint under Gotchas.