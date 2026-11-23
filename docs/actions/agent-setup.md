# Agent setup

{% raw %}

md² does not talk to model APIs. It starts the agent CLI you already have installed and reads its structured output, so the selected account's login, config, and permissions apply.

## Defaults

The **Run** tab of the application menu sets the defaults used by every agent action that does not override them:

| Control | Config key |
| --- | --- |
| Default agent | `desktop.agentSelection.activeAgent` |
| Default account | `desktop.agentSelection.settingsByAgent.<agent>.accountId` (empty = initial account) |
| Default model | `desktop.agentSelection.settingsByAgent.<agent>.model` (empty = the profile's default) |
| Default reasoning level | `desktop.agentSelection.settingsByAgent.<agent>.thinkingLevel` |

The selectors are disabled when there is no desktop backend.

An individual action can override the agent, account, model, and reasoning level (`agent`, `accountId`, `model`, `thinkingLevel`), and the action popup can override them again for a single run. Run settings take precedence over the action, then the desktop defaults, then the selected provider's initial account.

## Accounts

Open the configuration dialog and use **Agent accounts** to manage Codex and Claude logins. Each provider has an **Initial** account, which uses the CLI login inherited from the desktop environment. **Add account** lets you choose a separate configuration folder and complete that provider's login flow.

Each account row shows its login status. You can rename an account, log in or reauthenticate, and choose a replacement folder when its configured folder is missing or unreadable. Removing an additional account removes it from md² but leaves its folder and credentials on disk. The Initial account cannot be removed or moved.

Account selectors appear only for the built-in Codex and Claude profiles. Choose a provider's default account on the **Run** tab, store an override in an action definition, or choose an account for one run, schedule, or sequence. Model discovery, live usage, provider sessions, and account-reset schedules stay isolated by account. Switching accounts in an existing md² conversation starts or resumes the provider session belonging to that agent and account.

## Built-in profiles

| Profile | Executable | Models |
| --- | --- | --- |
| `codex` | `codex` | `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| `claude` | `claude` | `default`, `sonnet`, `fable`, `opus`, `haiku` |

At startup md² checks whether these executables are on the PATH and enables or disables them accordingly. Model catalogs are loaded separately for each account. No API key is configured in md².

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

Parsed events stream into the conversation panel and into the persisted log: assistant messages, reasoning, tool and command activity, commits, token usage, account identity, and Codex rate-limit status.

## Conversation logs

Transcripts are JSON files under `<projectFolder>/activity`, one per card plus one for project-level runs, referenced from the card's `agents` header field. Each log stores the full ordered transcript, which agent produced each assistant message, and the provider session id used to resume.

Resuming uses the provider session recorded for the same agent and account. Switching to another provider or account starts a separate provider session and sends the normalized transcript as context, so the md² conversation is not lost or resumed under the wrong login.

Closing the project or quitting the app ends live streaming sessions; a streaming process that dies before **Finish** fails the action.

{% endraw %}

See also: [Actions and agents](../concepts/actions-and-agents.md), [Running actions](running-actions.md).
