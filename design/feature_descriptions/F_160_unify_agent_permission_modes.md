---
author:
id: F_160
internalId: 3913c1ee-9bd7-40df-bfae-1f0188881b8f
title: unify agent permission modes
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__3913c1ee-9bd7-40df-bfae-1f0188881b8f.json#conversation=agent-0449be31-8b47-408e-9b6d-742a59d6f49a
policy:
branch: f_160_unify_agent_permission_modes
worktree: 1
---

Replace the separate access-level and approval-policy controls with one provider-independent `permissionMode`. Users choose the intended security behavior; MD² owns the Codex and Claude command-line mappings in code.

## Current state

Agent profiles expose user-configurable `accessLevels`, `accessLevelArgument`, `defaultAccessLevel`, `approvalPolicies`, `approvalPolicyArgument`, and `defaultApprovalPolicy` fields. Codex and Claude therefore expose provider terminology directly, and the app treats combinations that do not represent a useful security mode as valid.

The selected `accessLevel` and `approvalPolicy` also flow independently through desktop config, action definitions, run overrides, saved card action settings, execution results, activity history, and the action UI.

## Permission modes

Use one shared `PermissionMode` type with these values:

- `ask-for-approval` (default);
- `approve-for-me`;
- `full-access`.

Map each value in code as follows:

| `permissionMode` | Codex arguments | Claude arguments |
| --- | --- | --- |
| `ask-for-approval` | `--sandbox workspace-write --ask-for-approval on-request` | `--permission-mode acceptEdits` |
| `approve-for-me` | `--sandbox workspace-write --ask-for-approval on-request -c approvals_reviewer=auto_review` | `--permission-mode auto` |
| `full-access` | `--sandbox danger-full-access --ask-for-approval never` | `--permission-mode bypassPermissions` |

`approve-for-me` uses each provider's automatic safety reviewer. Claude `auto` can be unavailable for the installed version, account, model, or provider. Surface the provider error and do not fall back to another mode. `full-access` must retain an explicit warning because it disables the normal approval boundary.

## Implementation details

- Define the permission-mode values, default, validation, labels, descriptions, and Codex/Claude argument mappings as code constants beside the agent command adapters.
- Apply the mapping to one-shot, resume, and streaming commands before adding the provider output subcommand.
- Replace the access-level and approval-policy selectors in the app bar, action popup, action editor, and config page with one permission-mode selector.
- Preserve the existing resolution order: run selection, action override, then desktop default.
- Replace `desktop.accessLevel` and `desktop.approvalPolicy` with `desktop.permissionMode`. The selected default remains persisted, but provider arguments, provider values, and defaults are not user-configurable.
- Remove the six permission capability fields from `AgentProfile`, its validation, normalization, built-in profiles, configuration editor, and command builder. Custom profiles no longer define raw permission arguments. A profile without a built-in permission adapter does not support the permission-mode selector and must fail clearly if a mode is supplied.
- Replace action-definition, run-input, saved-action-setting, execution-result, event, log, and history fields named `accessLevel` or `approvalPolicy` with `permissionMode` where the permission choice remains relevant.
- Remove the obsolete fields from all shared declarations, bridge types, serializers, parsers, validators, UI props, status text, and tests. Do not retain aliases or legacy-shape fallbacks.
- Remove the old keys from stored desktop configuration and initialize `desktop.permissionMode` to `ask-for-approval`.
- Bump the card activity schema. Migrate version 3 saved settings and agent history to `permissionMode` only for recognised built-in Codex and Claude combinations. Reject an unrecognised legacy combination with a clear migration error instead of guessing. Historical permission fields that do not affect execution must not remain in the migrated record.
- Existing action JSON must use `permissionMode`; removed `accessLevel` and `approvalPolicy` fields are reported as unknown fields.

## Testing

- Test the exact command generated for all three modes for Codex and Claude in one-shot, resume, and streaming execution.
- Test validation of the three shared values, unsupported custom profiles, Claude `auto` failures, and absence of fallback behavior.
- Update config, action-definition, bridge, request, persisted-settings, history, status-display, and selector tests to use `permissionMode` only.
- Test desktop-config cleanup and the version 3 card-activity migration, including rejection of unknown legacy combinations.

## Acceptance criteria

1. Users see one permission-mode selector with the same three values for Codex and Claude.
2. Each mode produces exactly the provider arguments listed above for every execution path.
3. Provider-specific permission values and argument names cannot be edited in user configuration or agent profiles.
4. `accessLevel`, `approvalPolicy`, and their agent-profile capability fields no longer exist in active schemas, runtime payloads, persistence, UI, or implementation code.
5. The selected default and per-action/run override use `permissionMode`, with `ask-for-approval` as the default.
6. Unsupported modes and legacy combinations fail clearly; the app never silently selects a weaker or stronger mode.
