---
author: 
id: F_438
internalId: 7ce53acc-5a73-4566-931c-96751c9dac9b
title: add agent account management UI
status: ready for implementation
owner: 
affects:
agents:
policy:
branch: f_438_add_agent_account_management_ui
after: 6414956f-fccd-4086-974d-cd91d67eab99
worktree: 2
---

Add account management to the configuration dialog using the account model from F_436 and lifecycle bridge from F_437.

## Current state

* `config_page.tsx` and `config_value_editor.tsx` provide specialized editors for desktop configuration, including agent profiles and default agent settings.
* There is no renderer service or component for agent-account metadata and login status.
* Errors shown by React components are reported through `dialogService`.

## Implementation details

* Add a standalone `AgentAccountsEditor` beside the existing agent-profile configuration. Follow `design/STYLE_GUIDE.md` and the layout patterns used by related configuration editors.
* Show separate Codex and Claude sections. Keep the initial account first, followed by directory accounts in stable configuration order.
* Each row shows the editable display name, an `Initial` label or directory path, and the current login/availability status supplied by the desktop service.
* Provide `Add account`, `Log in` or `Reauthenticate`, directory reselection for a missing or moved directory, and removal for directory accounts. Do not offer directory changes or removal for the initial account.
* `Add account` invokes the native folder flow, displays the created account immediately, and starts its provider login. A cancelled folder picker creates nothing; a cancelled or failed provider login leaves the created row visible with a retry action.
* Renaming changes only the account name. It does not rename the folder, create a new account, or alter the account ID.
* Removal requires confirmation and explains that the provider directory and credentials remain on disk.
* Keep state and asynchronous operations in a renderer account service. Components subscribe to the smallest status or account-list projection they render; do not store account domain state in component-local state.
* Report lifecycle and persistence errors through `dialogService` in effects or event handlers and keep the editor in a safe usable state.
* Add focused React Testing Library coverage for listing, adding, renaming, retrying login, reselection, removal, cancellation, and provider isolation. Run affected app tests and app lint.

## Acceptance criteria

* The config dialog lists the initial and directory accounts separately for Codex and Claude.
* A user can select a folder, complete provider-owned login, rename the account, retry authentication, and reselect a moved directory.
* Login failure or cancellation affects only the relevant row and leaves unrelated accounts usable.
* The initial account cannot be removed or assigned a directory; a directory account can be removed without deleting files.
* The renderer displays metadata and status only and never receives credential content.
* Dialog layout, button placement, focus behavior, error reporting, and light/dark styling follow the project conventions.

