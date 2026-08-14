---
author: 
id: F_191
internalId: dcf2805e-c1f9-4aed-b160-e147134fe556
title: Small screen indent btn
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__dcf2805e-c1f9-4aed-b160-e147134fe556.json#conversation=agent-ef0c80c9-ac9b-45f7-90c9-db0d66ec3551
policy:
branch: f_191_small_screen_indent_btn
worktree: 3
---

Add an ´indent´ button to the markdown editor´s toolbar so that we can insert a tab when on mobile (idea is to increase, decrease bullet point indent)

# Current state

`MarkdownEditor` uses MDXEditor with Lexical's list plugin. Its shared `MarkdownFormatToolbarControls` provides list-type controls, but no controls for changing list nesting. Desktop users can use Tab and Shift+Tab while editing a list. Small-screen users may have no Tab key, so they cannot reliably increase or decrease list nesting.

All editable Markdown surfaces use the shared formatting controls, including list-card editor, card popup, and action phrase editor. Read-only surfaces omit formatting controls. Here, **small screen** means MUI's existing `theme.breakpoints.down('md')` breakpoint. **Indent** means move selected list item one nesting level deeper; it does not mean insert a literal tab character. **Outdent** means move selected list item one nesting level shallower.

# Implementation details

- Add a dedicated list-indent toolbar component beside other editor toolbar controls. On small screens, render two icon buttons after `ListsToggle`: **Increase indent** and **Decrease indent**. Keep them hidden above small-screen breakpoint and absent from read-only toolbars.
- Follow existing toolbar control pattern: MUI `IconButton`, outlined Material icons, `Tooltip`, matching `aria-label`, and disabled state when `activeEditor$` has no editor.
- Increase-indent button dispatches Lexical `INDENT_CONTENT_COMMAND`; decrease-indent button dispatches `OUTDENT_CONTENT_COMMAND`. After dispatch, return focus to active editor so user can continue typing.
- Apply commands to current Lexical selection. One selected list item changes one level; selection spanning multiple list items changes all supported selected items through Lexical's existing list behavior. Do not insert tab characters or rewrite Markdown directly.
- Keep current toolbar order, editor persistence, undo/redo history, desktop keyboard behavior, and non-list content unchanged.
- Add focused component tests for responsive visibility, disabled state, command dispatch, and focus restoration. Extend Markdown editor toolbar coverage to confirm controls appear only on small screens and only while editing.

# Acceptance criteria

- At small-screen breakpoint, every editable Markdown toolbar shows **Increase indent** and **Decrease indent** after list-type controls. Larger screens do not show these buttons.
- Each button has visible tooltip and matching accessible name. Both buttons are disabled until active Lexical editor exists.
- With caret in bullet or numbered list item, **Increase indent** moves item one nesting level deeper and updates serialized Markdown. **Decrease indent** moves nested item one level shallower and updates serialized Markdown.
- With multiple list items selected, either command applies once to supported selected items. One click never inserts literal tab character.
- After either command, editor regains focus and next typed character enters at current selection.
- Read-only Markdown toolbars show neither button. Existing desktop Tab and Shift+Tab behavior remains unchanged.
- Toolbar tests cover small and large viewports, both Lexical commands, unavailable-editor state, focus restoration, and read-only state.
