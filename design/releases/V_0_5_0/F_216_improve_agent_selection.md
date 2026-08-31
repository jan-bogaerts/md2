---
author: 
id: F_216
internalId: 902e08a9-8b29-4037-ab3d-92d53aef4fc8
title: improve agent selection
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__902e08a9-8b29-4037-ab3d-92d53aef4fc8.json
policy:
after: 8c0611fd-44e8-4f65-bc86-11c26afacc8e
---
right now, on the action popup, when changing the agent in the agent-selector component, it is a bit annoying:&#x20;

* The menu doesn´t look very good. Lets use sub menus for agent, model and thinking
* when agent changes, model and thinking level switch to 'none' which means the user always has to enter a model and thinking level as well, which means re-opening the context menu and such. this is annoying.

what we want:

* for each agent, set the default model and thinking level in the config dialog
* when switching agent, if the action-card combo (so in the activity file of the card) had already stored a model and thinking level for that agent from a previous selection, use that value, otherwise use the default values.
* if the user switching agent or model or thinking level, save cofig in card activity, already partly done I think, but we need to save model and thinking level per agent and then separately the currently active agent.

## Current state

Agent selection has three separate implementations. `AppMenu` owns global desktop agent, model, and thinking-level controls. `ActionAgentSelectors` owns action-popup controls. `ActionAgentCapabilityFields` owns action-definition overrides. Each surface implements dependent changes itself, so behavior can diverge.

Desktop config and card activity both store one flat active tuple: agent, model, thinking level, and permission mode. `ActionRunSettingsStore` persists that tuple per card and action. Changing agent in action popup therefore discards previous model and thinking level, selects profile default model, resets thinking level to `none`, and resets permission mode. Changing model also resets thinking level to `none`.

`AgentProfile` already supports `defaultModel`, but has no default thinking level. Config dialog edits profile default model, while separate global `desktop.model` and `desktop.thinkingLevel` fields apply only to currently selected desktop agent. Permission mode is one shared choice, not an agent-specific choice.

The action-popup model button currently opens one context menu containing labelled sections. That context menu needs nested menus: top-level Agent, Model, and Thinking level items each open their own submenu. The global app bar keeps its separate agent, model, and thinking-level controls. Here, **active agent** means agent currently used by surface; **thinking level** means reasoning-effort value passed to agent process.

## implementation details

- Add shared agent-selection domain model used by renderer and Electron. It stores active agent, one shared permission mode, and model/thinking pair keyed by agent. Add shared commands for selecting agent, selecting model, selecting thinking level, selecting permission mode, resolving defaults, and projecting active state into flat execution settings.
- Agent switch must keep permission mode unchanged. It activates remembered model/thinking pair for target agent; when none exists in current scope, it copies target profile defaults. Model change must not reset thinking level.
- Extend `AgentProfile` with required default thinking level alongside existing default model. Give built-in profiles explicit defaults. Update shared validation, TypeScript declarations, profile normalization, parity exports, config dialog profile editor, and related tests. Invalid or unavailable remembered values remain visible and produce existing validation/availability errors; do not silently replace stored values.
- Replace flat desktop agent/model/thinking storage with shared selection shape. Global desktop controls and action popup use same commands and resolution rules. Migrate existing desktop config by placing stored model and thinking level under stored active agent; retain stored permission mode unchanged.
- Change card activity `actionSettings[actionId]` to same selection shape. Bump activity schema version and migrate version 4 by placing flat model and thinking level under flat active agent. Keep targeted queued read-modify-write, optimistic updates, scoped events, waiting-input dirty state, and `dialogService` error reporting.
- For card-backed actions, card/action memory wins. Missing agent entry resolves from action-definition override when applicable, then desktop memory for that agent, then profile defaults. Project, folder, and regular-file contexts keep session-only memory but use same model and commands.
- Change only the action-popup context menu to use nested menus. Its top menu contains Agent, Model, and Thinking level entries; each opens a submenu. The Model submenu reflects the active agent. Preserve unavailable-agent disabling, run-state disabling, compact labels, keyboard navigation, focus return, and popup-width behavior. Security menu remains separate and writes shared permission mode. Keep the global app bar's agent, model, and thinking-level controls as separate controls; do not replace them with submenus.
- Keep action-definition file format declarative and flat. While editor is open, its draft keeps session-local per-agent pairs and uses shared commands, so switching away and back restores draft values and never changes permission mode. Save only active agent's flat override. Execution boundary likewise receives only active agent's flat model/thinking pair.
- Implement after B_154. Conversation switching may change visible conversation while run exists, but must not change agent-selection state or its persistence scope.
- Update shared schema/migration tests, desktop config tests, command-resolution tests, selection-domain tests, config editor tests, global app-bar behavior tests, action-definition tests, action-popup selector and submenu tests, settings-service tests, bridge tests, and queued activity-write race tests.

## acceptance criteria

- Config dialog allows default model and default thinking level for every built-in or custom agent profile and rejects defaults unavailable in that profile.
- Global desktop controls, action-definition controls, and action popup use same agent/model/thinking transition rules.
- Opening the action-popup model context menu shows Agent, Model, and Thinking level as nested menus, not labelled sections in one menu. Model choices match the active agent. The global app bar continues to show separate agent, model, and thinking-level controls without submenus.
- Switching agent restores model and thinking level last selected for that agent in current scope. Without remembered pair, target agent's resolved defaults appear. Neither value resets to `none` merely because agent or model changed.
- Switching agent never changes permission mode. One permission choice remains shared across agents, including after switching away, switching back, closing popup, or restarting app.
- Global per-agent choices persist in desktop config. Card-backed per-agent choices persist independently per card and action in card activity. Non-card action choices persist for session only.
- Existing desktop config and version-4 activity files migrate without losing active agent, model, thinking level, permission mode, conversations, or records.
- Starting or restarting action passes active agent's model and thinking level plus shared permission mode. Waiting-input changes still force restart before new settings apply.
- Conversation changes from B_154 do not reset, copy, or persist agent-selection state under another action or card.
- Loading, availability, validation, persistence failure, and concurrent activity writes retain existing safe behavior and user-visible error reporting.
