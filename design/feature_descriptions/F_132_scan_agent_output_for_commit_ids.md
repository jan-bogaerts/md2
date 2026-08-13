---
author: 
id: F_132
internalId: a57b89e0-49f4-4c25-9d99-deea222460cd
title: scan agent output for commit ids
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a57b89e0-49f4-4c25-9d99-deea222460cd.json#conversation=agent-c7887d99-2140-4994-aeeb-099aedd2ddde
  - design/activity/card__a57b89e0-49f4-4c25-9d99-deea222460cd.json#conversation=agent-008a9558-e47c-4ff4-864b-8490face1b07
policy:
after: e0010544-02b5-4372-82c7-bc05bd62929c
---
scan the agent's output to see if it contains any commit ids, like:&#x20;

`Commit: 88e196e1`

whenever found, store it so the card can show the commit in its list of diffs it can show.

The card already has a list of commit ids normally from other methods. This new commit can perhaps be in the same list.

## Current state

`ActionRun` stores commit references in the card's activity record. Command actions find Git-generated `[branch hash]` summaries in command output. Agent actions only contribute md2's own commit when `trackFileChanges` is enabled; untracked agent output is deliberately not scanned. Card commit menus already read every commit from these activity records, so no renderer change is needed.

## implementation details

- Define an agent commit marker as case-sensitive `Commit:` followed by whitespace and a 7-40 character hexadecimal Git object ID. Scan assistant text accumulated in `result.stdout`; do not scan stderr diagnostics.
- Add a dedicated parser in `shared/action_history.mjs`. Keep existing Git-summary parser unchanged because its only production caller handles command output.
- For every agent action, collect all marked IDs in output in first-seen order, in addition to any md2-created `trackedCommit`. Resolve each ID through `localGitService.resolveCommitMetadata` using execution repository root and branch, producing canonical hash, timestamp, file paths, and change counts.
- Feed resolved references through existing run-scoped collector and activity writer. Existing full-hash deduplication keeps one reference when output repeats an ID or names md2's tracked commit.
- Ignore text without valid marker syntax. If valid marker names a commit Git cannot resolve, fail history recording with existing metadata error; do not store invented metadata.
- Add parser and `action_run_history` tests for one marker, multiple markers, surrounding prose, malformed IDs, tracked-plus-reported duplicates, metadata resolution failure, and unchanged command parsing.

## acceptance criteria

- Agent output containing `Commit: 88e196e1` records resolved commit in originating card activity.
- Card's existing commit menu lists recorded commit and can open its diff without renderer changes.
- Multiple valid markers are stored once each, ordered by first appearance.
- Repeated markers and marker matching md2-created tracked commit produce one activity commit reference.
- Missing, malformed, or stderr-only markers produce no new commit reference.
- Valid marker for unavailable commit causes clear history-recording failure.
- Existing command commit detection and tracked-file commit capture keep current behavior.
