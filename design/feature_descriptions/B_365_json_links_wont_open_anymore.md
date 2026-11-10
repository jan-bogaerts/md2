---
author: 
id: B_365
internalId: 05c8cd40-0825-4fc1-abc8-b5f0389c2954
title: json links wont open anymore
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__05c8cd40-0825-4fc1-abc8-b5f0389c2954.json
policy:
---
when clicking on a link in the markdown editor pointing to a json file, we now get a white screen with a text: `md2 desktop bridges blocked for origin: null`

this was not the case with the previous build, so the last couple of cards must of broken something.

## Current state

Markdown links use normal browser navigation. In the packaged desktop application, a relative file link can resolve to a `file://` location and replace the trusted renderer document.

The preload script then runs in the new renderer document. Because a local file has origin `null` and does not match the trusted application location, the preload correctly withholds all desktop bridges and replaces the document body with `MD² desktop bridges blocked for origin: null`. The user is left on that page and cannot return to the running application.

`registerNavigationGuards` in `desktop/src/shell/renderer_security.js` is intended to prevent this. It currently handles `will-navigate` through the deprecated positional URL argument and denies new windows through `setWindowOpenHandler`, but the failing navigation path still reaches the untrusted document. JSON-specific application routing belongs to F-467; this bug must prevent the same application failure for every unsupported link type.

## implementation details

* Update `registerNavigationGuards` to inspect Electron's current navigation-event details and prevent untrusted main-frame navigation before it commits. Use `will-frame-navigate` and its `url` and `isMainFrame` fields instead of the deprecated positional `will-navigate` arguments.
* Allow navigation only to the exact trusted renderer document. Continue ignoring its hash when comparing locations so in-application hash navigation remains valid.
* For HTTP and HTTPS destinations, prevent application navigation and open the URL through `shell.openExternal`, as today.
* For every other untrusted destination, including `file://`, prevent navigation without loading that document. Do not relax the preload origin check and do not recover by reloading the application after navigation.
* Keep `setWindowOpenHandler` as the new-window guard with the same protocol policy.
* Update `renderer_security.test.mjs` to invoke the handlers with Electron's current event shape. Cover trusted application navigation, HTTP and HTTPS external links, local files, unsupported protocols, main-frame navigation, and subframe navigation.
* `registerNavigationGuards` has one production call site in `desktop/main.js`; update it directly without a compatibility flag or alternate mode.

## acceptance criteria

* Clicking a local or otherwise unsupported link cannot replace the MD² renderer document.
* After a blocked navigation, the current application view and unsaved renderer state remain intact.
* HTTP and HTTPS links open in the operating system's external browser and do not navigate the MD² window.
* New-window requests follow the same protocol restrictions as same-window navigation.
* The trusted renderer document remains loadable, including its in-application hash changes.
* The preload continues to expose no desktop bridges when an untrusted document is loaded directly.
* JSON-specific link handling is unchanged by this bug fix and remains owned by F-467.
