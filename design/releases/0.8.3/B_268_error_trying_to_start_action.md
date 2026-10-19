---
author: 
id: B_268
internalId: d99027a1-b108-4f1e-9f66-c669b4394cf0
title: error trying to start action
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__d99027a1-b108-4f1e-9f66-c669b4394cf0.json
policy:
after: 1eb24b57-bc11-41d1-8c8f-296b0dba31c1
---

tried to start an action on a card, got this error:

> 1 failed action

* (main): Card has no frontmatter: design/feature descriptions/F\_288\_clear\_dashboard\_values.md



it makes little sense. the card was simply available in the UI. We did remove a flush when selecting an agent, but the flush should happen when starting the action, most likely this got removed as well. check it

## Current state

- Reproduction clarified: `+` (custom prompt) starts a new agent conversation on a saved card. Failure repeats after saving.
- `runElectronAction()` in `app/src/services/actions/electron_action_runner.ts` already awaits `projectPersistenceService.flushPendingChanges()` when saves are pending, before starting the action. Flush means transferring editor buffers into service state, persisting queued changes, and awaiting storage writes. Selecting an action only flushes action-definition drafts through `action_popup_defaults.ts`.
- Conversation reservation in `desktop/src/actions/action/action_runner_service.js` allocates conversation identity; it does not read or write the card. During startup, `agent_conversation_persistence.js` writes initial activity, then `card_activity_reference.js` appends its path to the card's `agents` field before the agent process starts.
- Verified defect: `splitFrontmatter()` chooses CRLF if any CRLF occurs anywhere in the document. An LF header with a CRLF body therefore throws `Card has no frontmatter`, although renderer parsing through `shared/markdown_header_fields.mjs` accepts that header. LF means `\n`; CRLF means `\r\n`. Frontmatter means the opening metadata block enclosed by `---` lines.
- In-process reproduction: `---\ninternalId: card-1\n---\n\nBody\r\n` yields `hasHeader: true` in renderer and the reported error in desktop. Original `design/feature descriptions/F_288_clear_dashboard_values.md` is absent from this workspace, so its exact bytes remain unverified. Missing startup flush is not established.

## Implementation details

- Agreed fix: correct desktop frontmatter recognition and activity-reference insertion; keep startup flush unchanged. Before claiming this resolves the reported failure, inspect the saved failing card and reproduce its custom-prompt startup with those exact bytes.
- Production change belongs in `desktop/src/actions/activity/card_activity_reference.js`: recognize opening and closing delimiters independently of body line endings, accepting LF and CRLF as renderer already does. Parse header lines independently of their line endings; mixed header endings must not corrupt identity lookup.
- Preserve original body, delimiters, unrelated header lines, field order, and their existing line endings. Use the opening delimiter's line ending for newly inserted `agents` lines. Keep duplicate references unchanged and retain missing-header, malformed-header, missing-file, and identity-mismatch errors. Do not invent metadata or weaken identity checks to make startup succeed.
- Call-site impact: `appendReferenceToContent()` is called by `appendCardActivityReference()`; that function is called by `persistInitialCardConversation()`. New custom and named card-agent conversations receive the same parser correction. Existing conversations and project conversations use a different checkpoint path and retain current behavior. No mode flags or new service needed.
- Preserve existing flush-before-start behavior and reservation ordering. Card ownership remains `Card.header.internalId` / `cardInternalId`; conversation identity remains `AgentConversation.id`. Paths locate persisted files.
- Add a regression case to `card_activity_reference.test.mjs` for LF frontmatter with a CRLF body: renderer recognizes the header, desktop appends activity successfully, and unrelated bytes remain unchanged. Cover mixed header endings too; mock filesystem and Git boundaries. Run that file and `agent_conversation_persistence.test.mjs` in `desktop/`, plus desktop lint. Verify the reported saved-card custom prompt manually; if it still fails, inspect that file before attributing another cause.

## Acceptance criteria

- A saved card with LF frontmatter and CRLF body starts a new `+` custom-prompt conversation without `Card has no frontmatter`. Named card-agent actions use the same corrected linking behavior.
- LF-only, CRLF-only, and mixed-header documents link activity successfully when frontmatter and `internalId` are valid.
- Linking adds exactly one activity reference. Existing references, unknown fields, body bytes, and pre-existing line endings remain intact; repeated linking is unchanged.
- Missing or malformed frontmatter, missing card files, and mismatched identities still fail clearly. Linking failure does not commit the startup files or launch the agent process.
- Pending saves still finish before action start; save failure blocks startup. Merely selecting an action does not flush card changes.
- Focused regression tests and desktop lint pass. Manual custom-prompt reproduction on the reported card succeeds after saving and on repeat.
