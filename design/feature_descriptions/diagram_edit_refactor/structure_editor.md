# Move diagram structural edits and finish the session split

## Current state

`DiagramEditSessionService` still implements node, edge, group, and fragment creation; sequence-edge ordering; paste; deletion; and group membership. Deletion also detaches affected group members and fragment-region edges. `diagram_removal_plan.ts` and `diagram_paste_preparation.ts` prepare parts of these operations, but the session still owns their application and notification logic.

## Work

* Move structural operations into a session-owned structure editor, with a separate file for any substantial operation that has distinct validation or lifecycle logic. Use the shared edit context and canonical diagram; keep one transaction for each user operation.
* Move deletion application and reference cleanup with `removeObjects`, including group and fragment-region detachment. Preserve the existing removal pre-notifications and the affected membership events. Keep paste ID reservation and object insertion atomic.
* Migrate callers in selection, cut, paste, placement, edge and group drawing, sequence editing, and their tests. Remove the old session methods and private deletion helpers after migration. Do not retain forwarding wrappers or duplicate indexes.
* Finish the split by removing imports and helpers no longer used by the session. The remaining `DiagramEditSessionService` should own project binding, start/discard/save acknowledgement, canonical session state, interaction state, and the single event stream.

## Acceptance criteria

* `diagram_edit_session_service.ts` is **800 physical lines or fewer**, at least **1,000 lines below the 1,800-line baseline**. The reduction comes from moved ownership and behavior, not compressed formatting or a single replacement mega-file.
* Ordinary edits preserve the editable diagram and unrelated object references. Scoped subscriptions, dirty state, baseline resets, save behavior, and event order remain unchanged.
* Creation, paste, deletion, group membership, sequence ordering, and reference cleanup pass focused tests. Typecheck and app lint pass. Run only the diagram tests affected by the refactor unless a broader run is explicitly requested.

