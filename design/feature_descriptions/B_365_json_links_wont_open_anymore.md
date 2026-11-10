---
author: 
id: B_365
internalId: 05c8cd40-0825-4fc1-abc8-b5f0389c2954
title: json links wont open anymore
status: ready
owner: 
affects:
agents:
  - design/activity/card__05c8cd40-0825-4fc1-abc8-b5f0389c2954.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: b_365_json_links_wont_open_anymore
worktree: 1
changedFiles:
  - desktop/src/shell/renderer_navigation.electron.test.mjs
  - desktop/src/shell/renderer_security.js
  - desktop/src/shell/renderer_security.test.mjs
  - desktop/src/test/fixtures/trusted_navigation.html
  - desktop/src/test/fixtures/untrusted_navigation.html
  - desktop/src/test/renderer_navigation_electron.js
---
when clicking on a link in the markdown editor pointing to a json file, we now get a white screen with a text: `md2 desktop bridges blocked for origin: null`

this was not the case with the previous build, so the last couple of cards must of broken something.

## Current state

F-467 now intercepts scheme-less, project-relative JSON links and opens them in the JSON editor. It deliberately rejects URLs with a scheme, including existing `file:///...json` trace links. Markdown reference links also still use the ordinary Lexical link node instead of the node that retains the original Markdown URL. Links not handled by F-467 continue through normal browser navigation.

In the packaged desktop application, an unhandled local link can replace the trusted renderer document with a `file://` document. The preload script then runs in that document. Because a local file has origin `null` and does not match the trusted application location, the preload correctly withholds all desktop bridges and replaces the document body with `MD² desktop bridges blocked for origin: null`. The user is left on that page and cannot return to the running application.

`registerNavigationGuards` in `desktop/src/shell/renderer_security.js` is intended to prevent this. It currently handles `will-navigate` through the deprecated positional URL argument and denies new windows through `setWindowOpenHandler`, but the failing same-window navigation still reaches the untrusted document. The F-467 tests pass because they cover only an inline relative link such as `[data](data.json)` and mock the JSON router at the editor boundary. They do not cover `file:` URLs, reference-style links, or the packaged Electron navigation path.

JSON routing remains owned by F-467. This bug must prevent any unhandled link type from replacing the application with an unrecoverable security-warning page.

## implementation details

* Update `registerNavigationGuards` to inspect Electron's current navigation-event details and prevent untrusted main-frame navigation before it commits. Use `will-frame-navigate` and its `url` and `isMainFrame` fields instead of the deprecated positional `will-navigate` arguments.
* Allow navigation only to the exact trusted renderer document. Continue ignoring its hash when comparing locations so in-application hash navigation remains valid.
* For HTTP and HTTPS destinations, prevent application navigation and open the URL through `shell.openExternal`, as today.
* For every other untrusted destination, including `file://`, prevent navigation without loading that document. Do not relax the preload origin check and do not recover by reloading the application after navigation.
* Keep `setWindowOpenHandler` as the new-window guard with the same protocol policy.
* Update `renderer_security.test.mjs` to invoke the handlers with Electron's current event shape. Cover trusted application navigation, HTTP and HTTPS external links, `file:` URLs, unsupported protocols, same-window main-frame navigation, subframe navigation, and new-window requests.
* Add a packaged-desktop regression test or focused Electron test that exercises the navigation form used by Markdown links and proves the trusted renderer document is never replaced. A helper-only unit test is insufficient for this failure.
* `registerNavigationGuards` has one production call site in `desktop/main.js`; update it directly without a compatibility flag or alternate mode.

## acceptance criteria

* Clicking a `file:` link or any other unsupported link cannot replace the MD² renderer document.
* After a blocked navigation, the current application view and unsaved renderer state remain intact.
* HTTP and HTTPS links open in the operating system's external browser and do not navigate the MD² window.
* New-window requests follow the same protocol restrictions as same-window navigation.
* The trusted renderer document remains loadable, including its in-application hash changes.
* The preload continues to expose no desktop bridges when an untrusted document is loaded directly.
* Project-relative JSON links handled by F-467 continue to open in the JSON editor.
* JSON links not handled by F-467 are blocked safely instead of navigating to the preload warning page; extending JSON routing remains outside B-365.
