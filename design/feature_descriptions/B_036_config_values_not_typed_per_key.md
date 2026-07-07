---
id: B-036
title: config values are not typed per key, forcing casts at every consumer
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ConfigValues` is declared as `Record<ConfigKey, ConfigValue>` where `ConfigValue = boolean | number | string | AgentProfile[] | CardTypeConfig[]` (`app/src/services/config_service_core.ts`). Every read therefore returns the full union, and consumers narrow with `as` casts: `useConfigValue('desktop.agent') as string` (`app_menu.tsx`), `as AgentProfile[]`/`as string` in `action_popup_content.tsx` and `config_value_editor.tsx`, etc. This already caused real breakage: the 2026-07-07 audit found `npm run typecheck` failing on four `ConfigValue`-mismatch errors in the action popup (fixed with casts, matching the existing idiom — but the idiom is the bug). Casts silently go stale when an entry's type changes; the compiler can't catch a `desktop.agent` entry becoming a profile object, and every new consumer must know the runtime type by convention.

## Fix
- Define a per-key value map and derive everything from it, e.g.:
  ```ts
  interface ConfigValueTypes {
      'desktop.agent': string
      'desktop.agentProfiles': AgentProfile[]
      'desktop.model': string
      'project.cardTypes': CardTypeConfig[]
      'react.autoCommitDelayMs': number
      // … one line per ConfigKey
  }
  type ConfigKey = keyof ConfigValueTypes
  type ConfigValues = ConfigValueTypes
  ```
- Type `configService.get<K extends ConfigKey>(key: K): ConfigValueTypes[K]` and `set(key, value: ConfigValueTypes[K])`; `useConfigValue`/`useConfigValueOrFallback` already generic — they start returning the narrow type for free.
- Remove the now-redundant `as string` / `as AgentProfile[]` casts at consumers (`app_menu.tsx`, `action_popup_content.tsx`, `config_value_editor.tsx`, `github_auth_service`, commit batcher delay, …).
- Keep `ConfigValue` as the union only where genuinely heterogeneous handling is needed (the generic config-page editor, validation dispatch).

## acceptance criteria
- `configService.get('desktop.agent')` is typed `string` and `get('desktop.agentProfiles')` is typed `AgentProfile[]` without casts.
- No `as string`/`as AgentProfile[]`/`as CardTypeConfig[]` casts remain on config reads outside the generic config-page editor.
- Changing an entry's declared value type produces compile errors at stale consumers.
- `npm run typecheck`, lint and the app test suite pass.

## see also
- `design\feature_descriptions\ready\F_016_config.md`
- `design\feature_descriptions\ready\F_031_config_persistence.md`
