# Actions and agents

An **action** is a saved, reusable thing md² can run against a card, file, or folder. Actions live as JSON files in the actions folder and are part of the repository, so they are versioned and reviewable like everything else.

There are two kinds:

- **Agent actions** run a coding agent (Codex, Claude, or a profile you define) with a prompt.
- **Command actions** run a command line.

Both are started the same way, both stream their output into the same log, and both can be chained.

## Why not just paste prompts

A prompt you retype is a prompt that drifts. Actions give you:

- **Placeholders.** {% raw %}`{{card-file}}`{% endraw %} resolves to the card being acted on, so one definition works for every card.
- **Scoping.** `appliesTo` filters decide where an action shows up, so a bug-only action does not clutter feature cards.
- **Chaining.** `onBefore`, `on`, and `onAfter` compose small actions instead of growing one giant prompt.
- **No agent at all when none is needed.** Committing, running tests, or regenerating a diagram is a command action; it costs no tokens.

## Where actions run

Only the desktop side runs actions. The UI sends an action `id`, the context (which card, which file), and any run-specific input. The Electron-side runner reloads the stored definition, validates it, resolves placeholders, and executes the chain. The renderer never passes a command or prompt to be executed.

Practical consequence: in the web-only GitHub mode you can write and edit actions, but the run controls are disabled.

## Agent execution modes

Agent actions run in one of two modes.

**One-shot** (default). Each turn is its own subprocess. Codex runs `exec --json`, Claude runs `--print --verbose --output-format stream-json`. Input closes when the turn starts; a follow-up starts another process and appends to the same conversation log.

**Streaming** (`"streaming": true`). One provider process stays alive across turns — Codex `app-server --stdio`, Claude with `--input-format stream-json`. You can steer mid-run, answer the agent's questions, and the action only completes when you press **Finish** or the configured auto-finish state is reached. Streaming is for interactive, manual runs.

Both write the same transcript format, so history looks identical afterwards.

## Conversations belong to cards

Agent output is stored as JSON conversation logs under the project's `activity` folder, referenced from the card. Open a card weeks later and its prompts, answers, tool activity, commits, and token usage are still attached to it — instead of buried in a terminal scrollback or a provider's session list.

## Triggers

An action starts because you pressed **Run**, because a card entered a state (`onState`), because another action linked to it, or because a schedule fired. All four go through the same runner.

See also: [Action definition](../actions/action-definition.md), [Running actions](../actions/running-actions.md), [Agent setup](../actions/agent-setup.md).
