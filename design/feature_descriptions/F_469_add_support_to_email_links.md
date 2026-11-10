---
author: 
id: F_469
internalId: 644f4bf0-b21a-42ba-be1e-5b0daaecb1b8
title: add support to email links
status: ready
owner: 
affects:
agents:
  - design/activity/card__644f4bf0-b21a-42ba-be1e-5b0daaecb1b8.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: f_469_add_support_to_email_links
worktree: 2
changedFiles:
  - app/src/components/actions/conversation/messages/action_conversation_message.test.tsx
  - app/src/components/editor/links/markdown_link_dialog_navigation.test.ts
  - app/src/components/editor/links/markdown_link_dialog_navigation.ts
  - desktop/src/shell/renderer_security.js
  - desktop/src/shell/renderer_security.test.mjs
---

a link for creating an email should open the systems default email program

## Current state

An email link is a Markdown link whose URL uses the `mailto:` protocol. Two MD² link surfaces can receive one, and both currently end without opening an email program.

- Conversation messages: `react-markdown` keeps `mailto:` URLs, and `remark-gfm` turns bare email addresses into `mailto:` links. `ActionConversationLink` leaves these links to the browser engine, so a click starts a main-frame navigation (a navigation of the whole MD² window). `handleFrameNavigation` in `desktop/src/shell/renderer_security.js` cancels that navigation to protect the app, then opens nothing because `isApprovedExternalUrl` accepts only `http:` and `https:`.
- Markdown editor: the link dialog Open action calls `openMarkdownLink`. `routeJsonLink` ignores URLs with a protocol, and `EXTERNAL_LINK_PROTOCOLS` then rejects `mailto:`, so `window.open` is never called.

Approved web links already reach the system through `shell.openExternal`, which hands the URL to the operating system's default program for that protocol. `window.open` requests reach it through `handleWindowOpen`.

## Implementation details

- Add `mailto:` to `APPROVED_EXTERNAL_PROTOCOLS` in `desktop/src/shell/renderer_security.js`. Both `isApprovedExternalUrl` call sites, `handleFrameNavigation` and `handleWindowOpen`, need the new behavior.
- Add `mailto:` to `EXTERNAL_LINK_PROTOCOLS` in `app/src/components/editor/links/markdown_link_dialog_navigation.ts`. The Open action then uses the existing `window.open` path, and `handleWindowOpen` passes the URL to `shell.openExternal`.
- Do not change `ActionConversationLink`. A `mailto:` click stays a main-frame navigation attempt, and the guard cancels it before opening the email program, so MD² stays on the current view.
- Pass the URL unchanged, so `to`, `subject`, and `body` values reach the email program. Do not add parsing, validation, or other protocols.
- Do not add new failure UI. If `shell.openExternal` rejects, for example because the system cannot open the link, the rejection continues to the existing main-process `unhandledRejection` telemetry.
- Browser sessions served by the remote-control server need no separate code. The browser applies its own `mailto:` handling on the device showing MD².
- Tests:
  - `desktop/src/shell/renderer_security.test.mjs`: move `mailto:user@example.com` from the blocked navigation cases to the externally opened cases, because blocking it is the behavior this feature changes. Add a new-window case that opens `mailto:` externally.
  - `markdown_link_dialog_navigation.test.ts`: add `mailto:` to the opened URLs.
  - `action_conversation_message.test.tsx`: verify a `mailto:` link and a bare email address render with their `mailto:` href and no `_blank` target.

## Acceptance criteria

- In the desktop app, clicking a `mailto:user@example.com` link in a conversation message opens a new draft to `user@example.com` in the system's default email program.
- In the desktop app, clicking a bare email address in a conversation message does the same.
- In the desktop app, using Open in the Markdown editor link dialog for a `mailto:` link does the same.
- A `mailto:` link with `subject` and `body` values opens a draft with those values.
- After any `mailto:` click, MD² stays on the current view and unsaved editor content is retained.
- `http:` and `https:` links keep their current external-open behavior.
- `file:`, `javascript:`, `about:`, and custom app protocol links remain blocked by the external-open allowlists.