---
id: B-006
title: two sources of truth for the agent command
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ActionRunner` resolves the agent command from `configService.get('desktop.agent')` (React-side, editable in `/config`), while the conversation-continue path resolves it in `desktop/preload.js` via `resolveDesktopConfig()` (env vars). Editing the agent in the config page changes action runs but **not** "continue conversation" runs; after a restart both diverge from what the user saw in the UI (React config isn't persisted either — see F-031/B-005).

## Fix
- Make the desktop-persisted config the single source of truth (per F-031: `electron-store` + `setDesktopConfig` bridge).
- `preload.js` `continueAgentConversation` reads the stored value; React's `desktop.agent` entry reads/writes the same store through the bridge.
- Remove the env-only `resolveDesktopConfig` usage from the continue path (env stays as first-run default seeding the store).

## acceptance criteria
- Changing the agent in `/config` affects both action runs and conversation continues, immediately and after restart.
- Only one code path resolves the agent command on the desktop side.
- Tests assert the continue bridge uses the stored/bridged value, not `process.env`.

## see also
- `design\feature_descriptions\F_031_config_persistence.md`
- `design\feature_descriptions\F_012_agents.md`
