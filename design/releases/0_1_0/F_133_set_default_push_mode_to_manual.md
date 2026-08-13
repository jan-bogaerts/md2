---
author: 
id: F_133
internalId: 252c6173-b044-4c83-8867-e99254db44d5
title: set default push mode to manual
status: ready
owner: 
affects:
agents:
policy:
after: e6a79155-179c-46bb-b31e-722dffd7ec2e
---

probably best if we set the config's default push mode to 'manual'

## Current state

`project.pushMode` defaults to `auto` in both `CONFIG_ENTRIES` and `DEFAULT_PROJECT_CONFIG`. `ConfigService` uses the first when project config is missing or omits `pushMode`; project-folder creation uses the second. Explicit saved values override both defaults.

Auto mode pushes after persistence operations. Manual mode keeps commits pending, reports pending state, and exposes explicit Push action.

## Implementation details

- Change both push-mode defaults from `auto` to `manual`.
- Preserve explicit `auto` and `manual` values. Add no migration or compatibility branch; configs without `pushMode` receive new default.
- Do not change push execution, pending-commit restoration, persistence notifications, or Push action visibility.
- Update config-service and project-creation tests asserting default.

## Acceptance criteria

- New projects persist `pushMode: "manual"`.
- Missing project config, or config without `pushMode`, resolves to manual mode.
- Explicit `pushMode: "auto"` still enables automatic pushes; explicit manual mode keeps current behavior.
- Tests cover both default paths and explicit-value preservation.
