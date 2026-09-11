---
author: 
id: F_261
internalId: 3509c194-adbf-4e1c-ad64-6aa9560354b4
title: sentry inported card titles
status: ready
owner: 
affects:
agents:
  - design/activity/card__3509c194-adbf-4e1c-ad64-6aa9560354b4.json
policy:
after: 2775052a-2e84-4466-a320-155c8ec05bac
changedFiles:
  - app/src/services/data/card_operations.test.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/sentry/sentry_card_title.node.test.ts
  - app/src/services/sentry/sentry_card_title.ts
---
we often use very long labels for the cards created for bugs imported from sentry. We should find a way to shorten the filename a little bit and also make certain we don't use funky chars (already happens I think).

## Current state

`SentryApiClient` reads the Sentry issue `title` unchanged. `CardOperations.importSentryIssues` then uses that full value both as `Card.header.title` and as input to `createCardFile`; `buildSentryIssueMarkdown` separately writes the same full title under `**Title:**` in the card body.

`createCardFile` calls `slugifyTitle`, which already makes the filename safe: it lowercases the title, replaces every group outside ASCII letters and digits with the configured card separator, removes leading and trailing separators, and uses `untitled` when nothing remains. No title or filename length limit exists. A long Sentry title therefore produces a long card header title and filename, while punctuation, emoji, and other non-ASCII characters are already excluded from the filename.

## Implementation details

* Add a Sentry-specific title function and a named 50-character limit under `app/src/services/sentry/`. Do not change shared `createCardFile` or `slugifyTitle`; manually created cards and later user title edits keep current behavior.
* Build compact title by trimming outer whitespace, collapsing internal whitespace runs to one space, then retaining at most first 50 Unicode code points. Unicode code point means one complete character value, so truncation must not leave half of an emoji or other surrogate pair. Reject a title that becomes empty after whitespace normalization.
* In `CardOperations.importSentryIssues`, compute compact title once per issue and use it as draft title. This sets `Card.header.title` and supplies filename input. Continue passing original imported issue to `buildSentryIssueMarkdown`, so `**Title:**` keeps full Sentry title exactly as received.
* Keep existing filename sanitization. Resulting slug contains only lowercase ASCII letters, digits, and configured separator, with maximum 50 characters before `.md`; card id and extension remain outside that limit.
* Truncation happens only for newly imported Sentry cards. Existing cards are not renamed. Distinct issues may share compact title, but generated card ids remain distinct, so their paths do not collide.
* Add focused tests for whitespace normalization, 50-character boundary, Unicode-safe truncation, and empty normalized input. Extend Sentry card import test to verify compact header title and filename while body retains full title. Existing import identity, metadata, batching, and configured separator behavior must remain covered.

## Acceptance criteria

* Newly imported Sentry card uses whitespace-normalized `Card.header.title` of at most 50 Unicode code points.
* Sentry title longer than 50 Unicode code points is cut after code point 50 without splitting a character and without adding an ellipsis.
* Card body `**Title:**` contains full Sentry title received from API, even when header title is shortened.
* Imported card filename slug derives from compact header title and contains only lowercase ASCII letters, digits, and configured separator. Slug is at most 50 characters; card id and `.md` remain unchanged.
* Empty title after whitespace normalization fails before local state or storage changes.
* Titles already within limit remain unchanged except whitespace normalization.
* Manual card creation, user-driven title changes, and existing Sentry cards keep current behavior.
