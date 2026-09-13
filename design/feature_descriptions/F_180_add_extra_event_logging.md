---
author: 
id: F_180
internalId: 96236df6-2c3a-4846-9d52-f29b7ee9041d
title: add extra event logging
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__96236df6-2c3a-4846-9d52-f29b7ee9041d.json
policy:
after: 38781d24-46e6-4824-9587-b95bf62a0738
---
we currently only appear to log start and end of app. other things we can log:

* create card
* create action
* add worktree
* run action
* Release

## Current state

`TelemetryService` in `app/src/services/telemetry/telemetry_service.ts` owns renderer telemetry. It holds a `TelemetryEventName` union and a matching `TELEMETRY_EVENTS` set; `trackEvent` throws on any name absent from that set, then forwards the name plus a `runtime` field (`react_web` or `react_electron`) to Aptabase. No other payload leaves the app, so events carry no card, path, or project detail.

Renderer events that already exist: `react_start`, `react_stop`, `create_project`, `open_project`, `create_card`, `external_file_import`, `remarkable_import`, `navigation`, `complete_release`. The Electron main process has its own separate, smaller list in `desktop/src/integrations/telemetry.js`: `electron_starting` and `electron_stop`.

Against the five bullets above:

* **create card** — already covered. `CardOperations.createCard` fires `create_card` in `app/src/services/data/card_operations.ts:113`, after the new file is committed.
* **Release** — already covered by `complete_release`, fired in `app/src/services/release_operations.ts:308`.
* **run action** — deliberately out of scope for this feature; no run telemetry is added here.
* **create action** — missing. Two paths create an action file. `handleCreateAction` in `app/src/components/shell/menu/app_menu.tsx:300` calls `actionService.createDefinition` (which only builds an in-memory draft) and then `actionService.saveDefinition` to persist it; the mobile menu reaches the same handler through the `onCreateAction` prop of `MobileCreateMenu`. `defaultConvertPromptToAction` in `app/src/components/actions/run/popup/action_popup_defaults.ts:115` builds a definition from an existing prompt and writes it through `dataService.cards.saveProjectFile`.
* **add worktree** — missing. `WorktreeService.applyDraft` in `app/src/services/project/worktree_service.ts:417` applies the staged worktree draft: it performs the staged removals, then calls `storage.addWorktree(project, folderPath)` once per staged addition. Its only production caller is `handleSaveClick` in `app/src/components/config/config_page.tsx:182`.

## Implementation details

* Define **action creation** as writing a new action definition file for the first time. This excludes every later save of an existing action, so the event must not be fired from `ActionService.saveDefinition`, which serves both creation and edits.
* Define **worktree addition** as one successful `storage.addWorktree` call, that is, one worktree actually registered on disk. Staging an addition in the draft is not an addition; a draft the user abandons produces no event.
* Add `create_action` and `add_worktree` to both the `TelemetryEventName` union and the `TELEMETRY_EVENTS` set in `telemetry_service.ts`. Keep both lists alphabetically sorted, as they are today. Change nothing in `desktop/src/integrations/telemetry.js`: both flows start in the renderer, and the renderer already reports its own runtime.
* Fire `create_action` in `handleCreateAction` in `app_menu.tsx`, after `actionService.saveDefinition` resolves and before the view switches to the new file. The mobile menu needs no change; it delegates to this same handler. Because the call sits after the awaited save, a failed save reaches the existing `dialogService.error` branch and emits nothing.
* Fire `create_action` in `defaultConvertPromptToAction` in `action_popup_defaults.ts`, after `saveProjectFile` resolves and before the function returns. The occupied-path guard throws earlier, so a rejected conversion emits nothing.
* Fire `add_worktree` inside the additions loop of `WorktreeService.applyDraft`, immediately after each `await storage.addWorktree(...)` resolves. Placing it in the service, not in `config_page.tsx`, keeps counts correct when a draft stages several worktrees at once and when a later addition throws: each worktree that was really created is counted exactly once, and the ones after the failure are not.
* Keep telemetry non-blocking and failure-proof at the call sites, matching the `create_card` precedent: call `trackEvent` directly and never `await` it or wrap it in a `try`. `trackEvent` already swallows its own errors and is a no-op when no Aptabase key is configured.
* Test coverage, following the existing spy pattern (`vi.spyOn(telemetryService, 'trackEvent')`) used in `app/src/services/data/card_operations.test.ts`: assert `create_action` on both creation paths, assert no `create_action` on a plain re-save of an existing action, assert one `add_worktree` per applied addition, assert no `add_worktree` for a staged-then-discarded addition, and assert additions applied before a mid-loop failure still emit while the later ones do not. Extend the event-name coverage in `app/src/services/telemetry/telemetry_service.service.test.ts` so both new names are accepted by `trackEvent`.

## Acceptance criteria

* `TelemetryEventName` and `TELEMETRY_EVENTS` both contain `create_action` and `add_worktree`, and `trackEvent` accepts both without throwing.
* Creating an action from the app menu emits exactly one `create_action`. Creating one from the mobile create menu does the same, through the same handler.
* Converting a prompt into an action from the action popup emits exactly one `create_action`.
* Saving an edit to an existing action emits no `create_action`.
* An action creation that fails to persist emits no `create_action`; the existing error dialog still appears.
* Applying a worktree draft emits one `add_worktree` per worktree successfully added. A draft with three additions emits three events.
* Staging a worktree addition and then removing it from the draft, or leaving the config page without saving, emits no `add_worktree`.
* When one addition in a draft fails, the additions that succeeded before it still emitted their events, and the failure still propagates to the existing error handling with the worktree refresh intact.
* No event payload gains any new field: every event still carries only its name and `runtime`.
* With no Aptabase key configured, all new call sites are silent no-ops and change no behavior.
* `desktop/src/integrations/telemetry.js` is unchanged; `electron_starting` and `electron_stop` remain its only events.
* Existing telemetry, card-operations, action-service, worktree-service, and config-page tests still pass, plus the new assertions above.
