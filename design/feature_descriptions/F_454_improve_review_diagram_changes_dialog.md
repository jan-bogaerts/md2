---
author: 
id: F_454
internalId: 5b8fe025-448b-453b-a4f4-44d680b4a037
title: improve review diagram changes dialog
status: ready
owner: 
affects:
agents:
  - design/activity/card__5b8fe025-448b-453b-a4f4-44d680b4a037.json
policy:
branch: f_454_improve_review_diagram_changes_dialog
worktree: 1
changedFiles:
  - app/src/components/diagram_view/editing/diagram_editor_integration.test.tsx
  - app/src/components/diagram_view/editing/editable_diagram.tsx
  - app/src/components/diagram_view/review/diagram_change_action_popup.tsx
  - app/src/components/diagram_view/review/diagram_change_review_actions.tsx
  - app/src/components/diagram_view/review/diagram_change_review_button.test.tsx
  - app/src/components/diagram_view/review/diagram_change_review_button.tsx
  - app/src/components/diagram_view/review/diagram_change_review_card_fields.tsx
  - app/src/components/diagram_view/review/diagram_change_review_dialog.test.tsx
  - app/src/components/diagram_view/review/diagram_change_review_dialog.tsx
  - app/src/components/diagram_view/review/diagram_change_review_report.tsx
  - app/src/components/diagram_view/review/diagram_change_review_service.test.ts
  - app/src/components/diagram_view/review/diagram_change_review_service.ts
  - app/src/components/diagram_view/review/diagram_implementation_instructions.test.ts
  - app/src/components/diagram_view/review/diagram_implementation_instructions.ts
---

We have the 'review changes dialog' where the user can see all the changes that were applied to a diagram since it was last changed. If there are any, this list can be sent to an agent with a prompt.

When we created a new diagram, a mind map for instance, and then edit it, the 'review changes dialog' shows 'no diagram changes to review' and 'editable diagram is valid'.

Things to do:

* 'editable diagram is valid' this must be removed, it has no value. Only show something if the diagram is not valid, and why it is not valid.
* There is a non editable 'generated text' box. This must be a markdown editor (reuse existing component) so the user can change the text.
* the dialog must be resizable so the user can adjust the size of the input markdown editor.
* for new diagrams that don't have an 'edit' section yet, we need to be able to include the entire diagram in the instructions. perhaps best with a link?
* the 'review diagram changes' should resemble more like the 'new card' dialog, cause that is what the final end result should be of the action.\
  So the 'tooltip should also change to 'add card to implement diagram'
  * user must be able to select card type, column it should added to and add / modify a title
* auto generated title: `implement $diagram-title`&#x20;

## Current state

* `DiagramChangeReviewButton` opens a fixed-size `Review diagram changes` dialog. Its tooltip is `Review diagram changes`.
* `DiagramChangeReviewList` shows semantic changes since the edit-session baseline. Saving makes the current editable diagram the new baseline, so a saved user-created diagram can correctly have no remaining change rows even though its complete diagram still needs implementation.
* `DiagramChangeReviewReport` renders a success alert for valid data and renders generated instructions in a read-only `Paper`. Parser errors appear as blocking items.
* `DiagramChangeReviewActions` offers Close, Save, and Send to agent. Send to agent opens `DiagramChangeActionPopup`; it does not create a card.
* `DiagramChangeReviewService` owns generated text, validation blockers, selected change, reviewed change-set identity, and agent-run tracking. It has no editable card title, card type, target column, or Markdown draft.
* `NewCardDialog` already provides editable title, configured card-type pills, target-column picker, and `MarkdownEditor`. Card creation goes through `ProjectSessionService.createCard`, which applies normal card naming, identity, persistence, and error handling.
* A pending user-created root is identified by `DiagramRecord.pendingImplementation`. Its latest saved edit copy is the record whose `sourceDiagramId` equals root record ID. `DiagramRecord.path` identifies file location only; `DiagramRecord.id` remains diagram identity.

## implementation details

* Change toolbox tooltip and accessible label to `Add card to implement diagram`. Rename dialog title to the same text while keeping change-review list available for inspection and diagram-object selection.
* Make review service own card draft state: title, selected configured card type, selected configured target column, and a `MarkdownDraft` containing implementation instructions. On each open, initialize title as `implement ${editableDiagram.meta.title}`, select first configured type and column, validate complete editable diagram, and generate initial Markdown once. User edits persist while dialog stays open and are passed unchanged to card creation.
* Replace read-only generated-text `Paper` with existing `MarkdownEditor`. Keep editor in a flex region with `minHeight: 0`; hide success output. Render validation alert only when blocking items exist, including exact parser reason.
* For a pending user-created root, include a card-relative Markdown link to complete diagram JSON. Link latest saved edit-copy path when one exists; otherwise link source-record path. “Card-relative” means path is calculated from configured working folder, where new card file will be created, to diagram persistence path. Add generated semantic changes below link when changes exist. This makes a valid pending diagram actionable when change list is empty.
* Preserve current Save operation and failure behavior. Replace Send to agent with contained `Add card` action calling `ProjectSessionService.createCard` with current title, type, Markdown, and target column. Successful creation closes dialog. Failure keeps draft and dialog open; existing project/card services report error. Remove review-owned action-popup and implementation-run handoff state made unused by this path.
* Disable Add card when title is blank, configured type or column is unavailable, project is read-only, card creation is running, diagram is invalid, or Markdown is blank. Do not disable it merely because change list is empty when pending-diagram link supplies implementation context. Save remains disabled with no semantic changes or invalid diagram.
* Reuse `CardTypePillGroup` and `NewCardColumnPicker`; move or rename them only if needed to remove new-card-dialog-specific ownership. Do not duplicate their selection rules. Keep application draft state in review service; components subscribe to smallest fields with `useSyncExternalStore`.
* On desktop, make dialog paper resizable in both directions with a visible native resize handle, bounded by viewport and sensible minimum size. Header and footer remain fixed; body and Markdown editor consume available space and scroll internally. On mobile, use full-screen layout without resize handle.
* Remove `DiagramChangeActionPopup` from editable-diagram composition when no other call site remains. Update focused review-button, dialog, service, and editor-integration tests. Cover configured type/column selection, edited title/body, empty pending-diagram review, link path, invalid diagram, resize layout, successful card creation, and retained draft after failure. Run affected tests and `npm run lint` in `app/`.

## acceptance criteria

1. Diagram toolbox control has accessible label and tooltip `Add card to implement diagram`; activating it opens dialog with same title.
2. Dialog shows editable title defaulted to `implement $diagram-title`, configured card types, configured target columns, current semantic-change list, and editable Markdown instructions.
3. Valid diagram shows no validity message. Invalid diagram shows exact blocking reason and disables Save and Add card.
4. Desktop user can resize dialog horizontally and vertically; Markdown editor grows or shrinks with body. Mobile dialog stays full screen and usable.
5. Pending user-created diagram includes card-relative link to complete saved edit copy, or source diagram when no copy exists. Empty semantic-change list still allows Add card when link and other required fields are valid.
6. User changes to title, type, column, and Markdown are used in created card. Add card uses normal card-creation service, configured naming, canonical `Card.header.internalId`, persistence, and error reporting.
7. Successful Add card closes dialog and creates exactly one card in selected column. Failure creates no card, keeps dialog open, and preserves draft for retry.
8. Save keeps existing behavior. Closing dialog does not save, create a card, clear diagram edits, or open agent action popup.
9. Existing change-row selection still identifies affected diagram objects without moving or mutating them.
