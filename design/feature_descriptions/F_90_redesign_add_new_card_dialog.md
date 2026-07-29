---
author: 
id: F_90
internalId: eb3a4820-0edb-4161-8fe5-926a981d2c8f
title: redesign add new card dialog
status: new
owner: 
affects:
agents:
policy:
---

# Goal

redesign 'add new card' dialog

Reference mockup: \`New Card Dialog.dc.html\` (desktop + mobile side by side, light/dark toggle top-right).

Style tokens and component conventions: \`STYLE\_GUIDE.md\`.

\## Why



The current dialog is low-value and hard to scan:



\- The markdown template (Goal / Current status / Details / Tasks) is pre-inserted and rendered as large bold headings, so it dominates the dialog, doesn't look editable, and must be deleted for most cards.

\- Title — the one field that always matters — is visually secondary.

\- Type is a dropdown, which costs two clicks for a short, known list.

\- The footer's "Adds to \<column>" is static text, so the target column can't be changed without closing the dialog.

\- Net result: lots of empty space, little usefulness.



\## Scope



Two presentations of the same form and the same state:



\- \*\*Desktop\*\* — centered modal dialog over a scrim.

\- \*\*Mobile\*\* — full-height sheet.



Same fields, same validation, same submit behavior. Only layout, control sizing, and chrome differ. Breakpoint should follow whatever the app already uses; do not introduce a new one.



\---



\## Field order and behavior (both platforms)



\### 1. Title — primary field



\- First element in the body, autofocused on open.

\- Visually the largest input: \~17px/600 on desktop, \~18px/600 on mobile.

\- Placeholder \`Card title…\`.

\- Required. Create is disabled (or shows an inline error) while empty. Trim before submit.



\### 2. Type — single-select pill row



\- Replaces the dropdown with one-click pills.

\- \*\*Types are dynamic.\*\* Render one pill per type from the app's existing type source (same source the board/card already uses). Do not hard-code type names, count, or order — the row must work for 2 types or 12.

\- \*\*Colors are dynamic.\*\* Each pill shows a small round dot (8px) filled with that type's own color, taken from the type record. Never hard-code hex values per type; if a type has no color, fall back to a neutral token (\`--text-4\`).

\- Selected state: tinted background + border in the app's primary token, primary text color. Unselected: subtle track background, secondary text, transparent border; hover raises contrast.

\- Default selection: the app's existing default type (first in the list if there is no configured default).

\- Overflow: desktop wraps to multiple lines; mobile scrolls horizontally in one row (no wrap, no visible scrollbar chrome).

\- Keyboard: arrow keys move between pills, Space/Enter selects; the row is a single tab stop (radiogroup semantics — \`role\="radiogroup"\` with \`role\="radio"\` + \`aria-checked\` children).



\### 3. Description — markdown text area, on-demand template



\- Labeled \`Description\`, with a quiet \`Markdown\` hint next to the label on desktop.

\- Monospace font at 13.5px, line-height \~1.7, so it reads as editable source rather than rendered output.

\- Generously tall by default: \~270px desktop, \~260px mobile. Desktop is vertically resizable; mobile is not.

\- \*\*Template is opt-in, not pre-filled.\*\* A small \`Template\` button sits on the label row. Clicking inserts the markdown scaffold as plain editable text; the button then reads \`Clear\` and reverts the field. Rationale: most cards don't need all sections, and pre-filling forces deletion and makes an empty form look full.

&#x20; \- Only offer \`Clear\` while the body is still exactly the untouched template; once the user edits it, the button returns to \`Template\` and inserting again should append rather than overwrite. Never silently discard user-typed content.

&#x20; \- The template body itself should come from config, not be hard-coded in the component, so it can be edited later. (Optional follow-up, only if the team wants it: per-type templates keyed off the selected type — needs a template field on the type record, and switching type must not clobber edited text.)



\### 4. Target column — real control, not a label



\- Footer control reading \`Add to \<column>\`, with the column's dot and name, opening the column list.

\- Defaults to the column the dialog was launched from.

\- The chosen column is what the card is created in.



\---



\## Platform specifics



\### Desktop dialog



\- \~480px wide, auto height, on a dim scrim; card surface, 14px radius, elevated shadow, 1px border.

\- Header: small square primary-tinted icon tile with a plus glyph, title \`New card\`, spacer, icon-only close button on the right.

\- Footer bar (separated by a top border, page-background fill): column picker on the left, then \`Cancel\` (secondary) and \`Create card\` (primary) on the right.

\- \*\*This is a Windows app\*\* — the keyboard hint chip inside the primary button reads \`Ctrl+↵\`, not \`⌘↵\`. Use Windows modifier labels everywhere.

\- Shortcuts: \`Ctrl+Enter\` submits from anywhere in the form (including the textarea); \`Esc\` cancels. If the form has unsaved content, \`Esc\` should confirm before discarding.

\- Button order follows the app's existing dialogs (\`Run Dialog.dc.html\`) — do not invent a new order for this one dialog.



\### Mobile sheet



\- Full-height sheet filling the viewport below the status bar; the body scrolls, header and footer are pinned.

\- Header: \`Cancel\` (left, secondary), \`New card\` (centered title), \`Create\` (right, primary-colored text). The top-bar Create and the footer button are the same action — keep them in sync for disabled state.

\- Pinned footer, two rows: the column picker row above a full-width \`Create card\` button. Two rows because the picker opens its own list and needs its own tappable row; side by side would squeeze both below a comfortable touch width.

&#x20; \- Acceptable alternative if a single-row footer is preferred: move the column picker up into the scrolling body as a normal field and pin only the Create button.

\- All touch targets ≥ 44px tall; type pills 40px.

\- Add safe-area bottom padding so the footer clears the home indicator.



\---



\## Visual system



\- Use only existing tokens from \`STYLE\_GUIDE.md\` — surface, page, track, hover, border, border-strong, text-1…4, primary, primary-strong, primary-bg, on-primary. No new colors.

\- Must render correctly in light and dark themes; verify pill selected/unselected contrast in both.

\- Focus rings: 1px primary border + 3px primary-tinted ring on every input and textarea, matching existing fields.

\- Radii: 8–9px desktop controls, 11–12px mobile controls, 14px dialog.



\## Acceptance criteria



\- \[ ] Opening the dialog focuses Title; the description is empty (no template text).

\- \[ ] Type pills are generated from the dynamic type list with per-type colors from data; adding, removing, renaming, or recoloring a type is reflected with no code change.

\- \[ ] Selecting a type is one click; selection is visible in both themes; keyboard-navigable as a radiogroup.

\- \[ ] \`Template\` inserts editable markdown; \`Clear\` removes it; user edits are never lost without confirmation.

\- \[ ] Description is at least \~260px tall by default and monospace.

\- \[ ] The target column can be changed in the dialog and the card is created in the chosen column.

\- \[ ] \`Ctrl+Enter\` creates, \`Esc\` cancels (with confirm when dirty); no Mac modifier labels anywhere.

\- \[ ] Create is disabled while Title is empty, on both platforms and in both mobile Create affordances.

\- \[ ] Mobile: body scrolls, header/footer pinned, all targets ≥ 44px, footer clears the home indicator.



#