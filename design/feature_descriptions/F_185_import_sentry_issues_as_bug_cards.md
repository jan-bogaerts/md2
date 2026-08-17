---
author: 
id: F_185
internalId: d10103b8-7064-45cf-8b32-df0566889f78
title: Import Sentry issues as bug cards
status: ready
owner: 
affects:
agents:
  - design/activity/card__d10103b8-7064-45cf-8b32-df0566889f78.json
policy:
---

## Goal

Allow each user to connect MD² to their own Sentry account. While an editable project is open, MD² polls Sentry for unresolved issues and creates one Markdown bug card for every issue that has not already been imported. This runs inside the application; it does not use webhooks, GitHub Actions, pull requests, or merges.

## Current state

- `GithubAuthService` validates a user-supplied token, keeps authentication state in an `EventTarget`, and persists the token in `localStorage`. Sentry has outbound error reporting but no equivalent inbound account connection or API client.
- `DataService` owns the loaded project and exposes `CardOperations`. `CardOperations.createCard` allocates the next configured card number, updates project state, and commits the created file.
- Unknown frontmatter is preserved during card serialization, but it is not exposed on `CardHeader`; import deduplication therefore cannot query a Sentry identity from loaded cards.
- Card types and states are project-configurable. An importer cannot assume that a `bug` type or a `to fix` state exists.

## Required change

### Local Sentry connection

- Add a Sentry connection service following the existing GitHub authentication lifecycle and `EventTarget` state pattern.
- Let the user configure an API base URL, organization slug, project slug, environment, API token, target card type, and target card state. Persist these settings locally and key the project-specific values by the current `ProjectReference.id`; never write the token or connection settings into `md2.config.json` or generated bug cards.
- Default the API base URL to Sentry SaaS and the environment to `production`. Require the user to select a card type and state from the loaded project configuration before enabling imports.
- Validate the token and configured organization/project through Sentry before saving. Treat an unauthorized response as a disconnected session and retain a clear authentication error.
- Add a Sentry section to the configuration UI with connect, disconnect, enable automatic import, and `Import now` controls. Show the last successful poll time and the latest import error without repeatedly opening dialogs for background failures.

### Polling and issue retrieval

- Add a Sentry API client that lists unresolved issues for the configured organization, project, and environment, follows Sentry pagination, and retrieves the recommended event for each issue selected for import.
- Poll once after a writable project and its Sentry settings are ready, then every 15 minutes while the application remains open and automatic import is enabled. `Import now` uses the same operation.
- Allow only one poll at a time. Associate every request with the project identity that started it and discard its result if the user changes or closes the project before persistence begins.
- Stop polling when the session is disconnected, configuration becomes incomplete, the project closes, or the project is read-only.

### Deduplication and card identity

- Extend `CardHeader` and Markdown parsing/serialization with optional `sentryIssueId`, `sentryOrganization`, and `sentryBaseUrl` fields. Existing cards without these fields remain valid.
- Define an imported issue identity as the tuple of normalized Sentry base URL, organization slug, and Sentry issue ID. Before fetching event details and again immediately before creating cards, build the imported identity set from the current loaded cards and exclude matches.
- Treat a Sentry issue group as one bug. Repeated events in the same issue must never create additional cards, and polling must not overwrite or update an existing imported card.

### Batched bug creation

- Add a dedicated `CardOperations.importSentryIssues` operation instead of changing the behavior of `createCard`; its current callers continue to create ordinary cards unchanged.
- Fail the import with a clear configuration error if the selected card type or state no longer exists in the loaded project.
- Allocate card numbers from the current file set, create every missing bug file in memory, apply the Sentry identity frontmatter before parsing, update project state once, and commit all files from the poll in one batch. Each card receives its own `internalId` and follows the configured working folder, separator, card type prefix, state, commit, and push behavior.
- Include the Sentry issue title, message, link, first/last seen timestamps, occurrence count, release, environment, culprit, event ID, and relevant application stack frames in the body. Do not copy request bodies, cookies, authorization data, complete user payloads, or attachments.
- A failure before the batch commit must not leave an in-memory card without its Sentry identity. Existing persistence failure and retry behavior remains responsible for a failed commit.

## Edge cases and side effects

- The first enabled poll can import every unresolved issue matching the configured project and environment; show the count for confirmation before the first import when it is non-zero.
- Changing Sentry account, organization, project, or self-hosted base URL creates a separate identity scope. Existing imported cards remain untouched.
- Two MD² installations can independently import the same Sentry issue before either receives the other's repository update. The normal repository conflict flow applies; local in-flight locking cannot prevent cross-installation races.
- Sentry rate limits, timeouts, malformed event payloads, missing stack traces, and individual event-detail failures must not duplicate already imported cards. Keep successfully prepared issues eligible for a later poll when the whole batch is not persisted.
- Resolving or deleting an issue in Sentry does not move, archive, or delete its MD² card.
- Automatic imports use the project's existing push mode. They do not introduce a separate push, branch, pull-request, or merge workflow.

## Tests

- Sentry connection service: restore, validate, save, disconnect, unauthorized response, project-scoped settings, and token exclusion from project files.
- Sentry API client: organization/project/environment query, pagination, recommended-event loading, rate-limit/error handling, and malformed optional event fields.
- Polling service: project-open start, 15-minute repeat, manual import, single in-flight request, stop conditions, background error state, and stale-project result rejection.
- Markdown parsing: parse, serialize, edit, and reload the three Sentry identity fields without changing unrelated or unknown frontmatter.
- Import operation: configured card type/state, sequential IDs, unique internal IDs, one state update, one batched commit, existing push behavior, missing type/state failure, and no partial in-memory creation on preparation failure.
- Deduplication: repeated polls, repeated events in one Sentry issue, existing imported cards, changed Sentry identity scope, and a card added while an API request is in flight.
- UI: connection validation, masked token input, project-specific fields, disabled controls for read-only or incomplete projects, first-import confirmation, import result, last-success time, and non-repeating background failure display.
- Run app lint, app unit tests, and the directly affected integration/UI tests.

## Acceptance criteria

- A user can configure and validate their own Sentry connection without modifying project files.
- An enabled writable project polls Sentry in the application and can also import on demand.
- Every previously unseen Sentry issue group produces exactly one correctly configured Markdown bug card and one Sentry issue never produces duplicate cards in the same identity scope.
- One poll persists all new cards as one batch through the existing project storage, commit, and push path; no pull request or merge is introduced.
- Imported cards retain their Sentry identity through normal edits, renames, reloads, archives, and releases.
- Background polling stops under the defined conditions and never writes results into a project other than the one that started the request.
- Existing manual card creation, project configuration, outbound Sentry reporting, and non-Sentry cards keep their current behavior.
