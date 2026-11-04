---
author: 
id: B_329
internalId: b71e73f9-ddd6-4a14-bf59-7f9415ad0614
title: changing appearence not applied
status: ready
owner: 
affects:
agents:
  - design/activity/card__b71e73f9-ddd6-4a14-bf59-7f9415ad0614.json
policy:
changedFiles:
  - app/src/theme/theme_provider.tsx
---

In the project section of the config dialog, we can select a background shade color for the application. It seems that this color is only applied after restarting the app or re-opening the project again.

This should be done when the config is saved.

So don't use a global project-wide event monitor for this, but use something specific, so the background only reloads when the config has changed

## Current state

`AppThemeProvider` reads `project.backgroundShade` through `useProjectConfig`. That hook subscribes to the project-wide `DataService` `changed` event.

Saving the config dialog applies the draft to the canonical `ConfigService` values and emits a config change, but it does not emit a `DataService` change. The expected project-file watcher event also does not reload locally saved config. The theme therefore keeps the old shade until another project-wide change occurs or the project is reopened.

## Implementation details

- In `app/src/theme/theme_provider.tsx`, read `project.backgroundShade` with the existing `useConfigValueOrFallback` hook instead of `useProjectConfig`.
- Use `neutral` as the fallback while `ConfigService` is not initialized, preserving the current no-project behavior.
- Keep the theme memoization dependent on `backgroundShade`. The config-value snapshot is a primitive, so unrelated config notifications do not rebuild the theme.
- Add a regression test in `app/src/theme/theme_provider.test.tsx` proving that applying a changed canonical background shade rebuilds the theme without a project-wide `DataService` event.

## Acceptance criteria

- [ ] Saving a changed background shade updates the application theme immediately without reopening the project or restarting the application.
- [ ] Editing the background-shade draft without saving does not update the application theme.
- [ ] Unrelated project or config changes do not rebuild the theme because the background-shade snapshot is unchanged.
- [ ] When project config is unavailable, the theme continues to use the `neutral` shade.
- [ ] The focused theme-provider tests pass.
