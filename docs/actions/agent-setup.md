# Agent setup

{% raw %}

md² does not talk to model APIs. It starts the agent CLI you already have installed and reads its structured output, so your existing login, config, and permissions apply.

## Defaults

The **Run** tab of the application menu sets the defaults used by every agent action that does not override them:

| Control | Config key |
| --- | --- |
| Default agent | `desktop.agent` |
| Default model | `desktop.model` (empty = the profile's default) |
| Default reasoning level | `desktop.thinkingLevel` |

The selectors are disabled when there is no desktop backend.

An individual action can override all three (`agent`, `model`, `thinkingLevel`), and the action popup can override them again for a single run.

## Built-in profiles

| Profile | Executable | Models |
| --- | --- | --- |
| `codex` | `codex` | `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| `claude` | `claude` | `default`, `sonnet`, `fable`, `opus`, `haiku` |

At startup md² checks whether these executables are on the PATH and enables or disables them accordingly. Model lists come from the profile — no provider API is called and no API key is needed.

`desktop.codexSearchEnabled` adds `--search` to Codex runs.

## Reasoning levels

`none`, `low`, `medium`, `high`, `max`. `none` passes no override. `max` maps to the provider's highest level (`xhigh` for Codex). Reasoning level can only be set once an agent and model are explicitly chosen.

## Custom profiles

`desktop.agentProfiles` in the config dialog (section **Desktop**) holds the profile list. Built-in profiles are merged in; a profile with the same name replaces the built-in one.

```json
{
  "name": "my-agent",
  "command": ["my-agent", "--flag"],
  "models": ["fast", "smart"],
  "defaultModel": "smart",
  "monthlySubscriptionCostUsd": 100,
  "modelArgument": "--model",
  "resumeCommand": ["my-agent", "resume", "{{sessionId}}"]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Unique profile name, shown in the selectors. |
| `command` | yes | Executable and arguments, as an array. |
| `models` | yes | Non-empty list of model names offered for this profile. |
| `defaultModel` | no | One of `models`. Defaults to the first entry. |
| `monthlySubscriptionCostUsd` | no | Monthly subscription price in USD, used for estimated-cost Stats. Must be greater than zero. |
| `modelArgument` | no | Argument used to pass the model, for example `--model`. |
| `resumeCommand` | no | Command used to resume a session; may contain `{{sessionId}}`. |

If `command` contains `{{model}}`, the model is substituted there instead of being appended with `modelArgument`.

The monthly subscription cost is optional. It does not affect agent execution or token/time statistics. When configured, md² combines the price with observed account-limit usage to estimate cost per agent, action, and card. These are subscription-cost estimates, not provider invoices or API token prices. See [How usage and cost are calculated](../concepts/usage-and-cost.md).

Invalid profiles are dropped when configuration is read rather than blocking startup; if nothing valid remains, the built-ins are used.

## How turns are executed

| Mode | Codex | Claude |
| --- | --- | --- |
| One-shot | `exec --json` | `--print --verbose --output-format stream-json` |
| Streaming | `app-server --stdio` | adds `--input-format stream-json` and a stdio permission prompt tool |

Parsed events stream into the conversation panel and into the persisted log: assistant messages, reasoning, tool and command activity, commits, token usage, and Codex rate-limit status.

## Conversation logs

Transcripts are JSON files under `<projectFolder>/activity`, one per card plus one for project-level runs, referenced from the card's `agents` header field. Each log stores the full ordered transcript, which agent produced each assistant message, and the provider session id used to resume.

Resuming uses the recorded provider session id. Switching to another provider mid-conversation sends the normalized transcript through stdin, so context is not lost.

Closing the project or quitting the app ends live streaming sessions; a streaming process that dies before **Finish** fails the action.

{% endraw %}

See also: [Actions and agents](../concepts/actions-and-agents.md), [Running actions](running-actions.md).
