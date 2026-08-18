---
author: 
id: B_122
internalId: d6f7cd44-6ed1-47b7-b37f-b048ece0a720
title: connect to sentry fails
status: ready
owner: 
affects:
agents:
  - design/activity/card__d6f7cd44-6ed1-47b7-b37f-b048ece0a720.json
policy:
branch: b_122_connect_to_sentry_fails
after: 4a471f6a-6bca-4990-9e2d-38dc2df2ce9f
---

getting this error when trying to connect to sentry from the config page:

> Failed to execute 'fetch' on 'Window': Illegal invocation

## Current state

Config page sends complete Sentry settings to `SentryConnectionService.connect()`. Service asks shared `SentryApiClient` to validate configured organization and project before it persists settings.

Default `SentryApiClient` stores browser `fetch` as a detached function. Later, `request()` calls that function with `SentryApiClient` as receiver instead of browser global object. Browser rejects call with `Illegal invocation` before any Sentry request is sent. Explicitly injected test fetch functions do not require browser receiver, so current tests miss failure.

Shared client also serves automatic and manual issue imports. Connection validation currently reaches faulty path first; same receiver bug can affect import requests.

## implementation details

- Bind default fetch dependency to `globalThis` before storing it in `SentryApiClient`, for example `globalThis.fetch.bind(globalThis)`. Keep injected `SentryApiClientDependencies.fetch` contract unchanged.
- Keep request URLs, bearer-authentication headers, response parsing, error handling, connection persistence, and UI behavior unchanged.
- Existing call sites all need corrected behavior: `SentryConnectionService` uses shared client for project validation; `SentryImportService` uses it for issue and event requests. Tests that construct client with injected fetch keep current behavior. No compatibility flag or alternate request path is needed.
- Add regression test in `sentry_api_client.node.test.ts` that constructs client with default dependency and a receiver-sensitive global fetch stub. Test must fail when fetch receiver is not `globalThis`, then verify validation URL and headers.
- Run app lint, app unit tests, and directly affected Sentry tests.

## acceptance criteria

- Clicking `Connect` with complete valid settings sends Sentry project-validation request without `Illegal invocation`.
- Validation request uses configured API base URL, organization slug, project slug, and bearer token exactly as before.
- Successful validation persists project-scoped settings and changes connection state to authenticated.
- Sentry HTTP, authorization, and malformed-response failures still use existing connection and import error handling.
- Automatic and manual imports can use shared client without fetch-receiver failure.
- Regression test proves default browser fetch keeps required global receiver; existing injected-client tests remain unchanged and pass.
