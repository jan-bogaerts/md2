---
author: 
id: B_319
internalId: 379541e5-0bb0-437e-a7c5-4d844ccdffc9
title: codex not using tasks
status: design
owner: 
affects:
agents:
  - design/activity/card__379541e5-0bb0-437e-a7c5-4d844ccdffc9.json
policy:
---

We recently implemented support for task lists. this is working ok for claude, but not for codex. Investigate why this is.

## Findings

* Task tracking is enabled in the desktop configuration. The task-list model, persistence and UI are working.
* Both Codex paths already decode task updates: streaming handles `turn/plan/updated`; one-shot handles `todo_list` lifecycle items.
* Claude is explicitly given its task tools when tracking is enabled. Codex is not explicitly enabled: MD² only adds `tools.update_plan.enabled=false` when tracking is disabled and otherwise relies on the Codex default.
* MD² does not instruct Codex to use `update_plan`. Having the tool available does not require the model to call it, even when an action prompt asks it to create tasks.
* Codex app-server supports `developerInstructions` on both `thread/start` and `thread/resume`. This is the appropriate boundary for a persistent Codex-only task-tracking instruction.
* Codex Goals are not a replacement for this task list. A Goal is one persistent objective; the existing component represents multiple plan steps.

## Implementation plan

1. Change Codex command construction to always set `tools.update_plan.enabled` explicitly: `true` when agent task tracking is enabled and `false` when disabled. Keep Claude command behavior unchanged.
2. When tracking is enabled, pass a concise Codex `developerInstructions` value on new and resumed streaming threads. Require Codex to use and maintain `update_plan` for multi-step work and whenever the user explicitly requests tasks. Do not create a plan for a simple one-step request or answer-only question.
3. Apply the equivalent instruction at the prompt boundary for one-shot Codex runs, which do not use app-server thread settings.
4. Keep the existing task-list decoders, persistence and React component unchanged.
5. Add targeted tests for enabled and disabled Codex commands, new and resumed thread instructions, one-shot prompt instructions, and plan/todo updates reaching the existing task-list update path.
