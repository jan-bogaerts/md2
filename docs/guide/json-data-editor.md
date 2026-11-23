# Edit JSON data

md² turns linked JSON into structured fields and tables, so you can inspect and update project data without switching to a raw JSON editor. Use it for inventories, test cases, migration inputs, agent datasets, and other structured files that belong with the work described in your Markdown.

## Open a JSON file

Add a Markdown link whose target ends in `.json`, then use the link's **Open** action:

```markdown
[API endpoints](../data/endpoints.json)
```

Relative paths resolve from the Markdown file containing the link. They are the best choice for files in the repository because the link keeps working across clones and worktrees.

In desktop mode, absolute Windows paths and `file:///` links can open JSON outside the active project. Those links are machine-specific and should not be used for shared project documentation.

Where the editor opens depends on the current workspace:

- In **Board** view, the JSON file opens in a resizable popup anchored to the link.
- In **List** view, the JSON file opens in a tab. Opening it again activates the existing tab instead of creating a duplicate.

The file must contain valid JSON. If it is missing, unreadable, or malformed, md² shows an error and does not open an editable document.

## Edit values

The editor chooses a layout from the value at the current JSON location:

| JSON value | Editor layout |
| --- | --- |
| Object | Resizable **Field** and **Value** columns. Property names remain fixed; scalar values are editable. |
| Array of objects | Table whose columns are the union of the objects' field names. |
| Empty, primitive, or mixed array | Table with one **values** column. |
| String, number, boolean, or `null` | A type-preserving scalar control. |

Editing a scalar keeps its JSON type. Number input is validated before it changes the document. A missing field in an object-array row is created when you edit its empty cell.

Drag a column separator to resize a table or use its keyboard controls. Wide arrays scroll horizontally. Large arrays use lightweight rows while you scroll and restore their editable controls when scrolling settles.

## Navigate nested data

Objects and arrays inside a field appear as **Open** controls. Open one to make it the current value. The breadcrumb above the editor shows the path from the file root and lets you return to any ancestor.

Array row numbers in the breadcrumb use zero-based JSON indexes, for example `[0]` for the first row.

## Work with array rows

Select one or more rows, then use the footer actions:

| Action | Behavior |
| --- | --- |
| **Add** | Appends an empty object to an object table, or `null` to other arrays. |
| **Delete** | Removes the selected rows. |
| **Copy** | Copies the selected values, in row order, as a JSON array. |
| **Cut** | Copies the selected rows and removes them after the clipboard write succeeds. |
| **Paste** | Inserts a JSON array after the last selected row, or at the end when no row is selected. |

Clipboard content for **Paste** must be a valid JSON array. Invalid content leaves the document unchanged and produces an error.

## Save and external changes

JSON inside the active project follows the normal project save and commit flow. JSON opened through an absolute local path is saved directly to that file instead.

When the project is read-only, you can browse the data but cannot change it. If a project JSON file changes outside md² while you have unsaved edits, md² keeps your draft and warns you instead of overwriting it.

## Use the data in an agent action

After preparing a JSON dataset, attach it to an agent action with **For each** to run the same focused prompt for every record. The attachment is saved with the draft or conversation; it is not a live link to the source file. See [Run an action for each JSON record](../actions/for-each.md).

See also: [List view](text-view.md), [Cards and files](../concepts/cards-and-files.md), [Git and commits](git-and-commits.md).
