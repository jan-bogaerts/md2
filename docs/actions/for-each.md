# Run an action for each JSON record

For-each runs the same agent action over a JSON dataset. Attach the data when you open an action, then let md² process its records in order while it tracks progress and keeps every result with the conversation.

Use it for repeated work driven by structured data, such as reviewing a list of endpoints, updating several modules, checking repository findings, or producing one result for every item in an inventory.

For-each is available for agent actions in the action popup. It is run-specific: the JSON data and settings belong to the draft or conversation, not to the reusable action definition.

## Attach JSON data

If the source file is linked from a Markdown card or design note, you can first inspect and update it with the [JSON data editor](../guide/json-data-editor.md).

1. Open an agent action.
2. Open the prompt menu beside the prompt box.
3. Choose **For each** and select one `.json` file.
4. Write or select a prompt that uses the current record, then run the action.

After attachment, the loop icon appears beside the prompt menu. Its tooltip shows the selected file name. Open it to **View** the saved JSON, **Remove** it, or change the loop **Setup**.

md² saves the parsed JSON with the draft or conversation. Viewing or continuing the run does not depend on the original file remaining in place. Selecting another valid JSON file replaces the current attachment; an invalid file leaves the existing configuration unchanged.

## Choose the records

A root JSON array is the record list:

```json
[
  { "method": "GET", "path": "/users" },
  { "method": "POST", "path": "/users" }
]
```

A root object is one record by default. If the object contains the list you want, open **Setup** and set **Path to list data**:

```json
{
  "api": {
    "endpoints": [
      { "method": "GET", "path": "/users" },
      { "method": "POST", "path": "/users" }
    ]
  }
}
```

For this example, use `api.endpoints`. Selectors use dot-separated object keys and zero-based array indexes, so a path such as `groups.0.endpoints` can traverse an array inside the object. The selected value must be an array.

An empty root array or selected array completes without starting an agent turn. A root object without a selector runs once with that object as the record.

## Use the current record in a prompt

{% raw %}

| Placeholder | Value |
| --- | --- |
| `{{data}}` | The complete current record as pretty-printed JSON. |
| `{{data path}}` | The value at a dot-separated path in the current record, such as `{{data path}}` or `{{data owner.name}}`. Numeric segments select array items. |

For the endpoint data above, an action prompt could be:

```text
Review this endpoint for missing validation and authorization checks:

{{data}}

Pay particular attention to the {{data method}} request at {{data path}}.
```

Strings selected by a path are inserted as plain text. Numbers, booleans, `null`, objects, and arrays are inserted as JSON. A missing path fails that record according to the selected failure policy.

Data placeholders require an active for-each record. Using one in an ordinary run fails before the agent starts.

{% endraw %}

## Configure the loop

Open the loop icon and choose **Setup**.

| Setting | Behavior |
| --- | --- |
| **At end: Add prompt** | Keep one conversation and add every later record as another prompt. This is the default. |
| **At end: Compact** | Keep one conversation and compact it after each full batch when more records remain. |
| **At end: New conversation** | Start a new conversation for each batch. |
| **Records per batch** | Number of consecutive records that share a conversation before Compact or New conversation applies. |
| **On failure: Log and continue** | Record the failure and continue with the next record. This is the default. |
| **On failure: Stop on first failure** | Record the failure and do not start later records. |
| **Start index** | Zero-based position of the first record to process. Use `2` to start with the third record. |
| **Step by step** | Pause after each completed record so you can continue it, advance with **Next**, or stop. |
| **Path to list data** | For a root object, select the nested array to process. |

**Records per batch** is available for Compact and New conversation. Batch counting starts at the configured start index. Add prompt always keeps one conversation, so the batch value does not affect it.

Setup changes are disabled while the loop is running.

## Monitor, stop, and resume

A determinate progress bar in the action popup and on the card's action button shows completed records against the total. Records handled by **Log and continue** count as processed after their failure is recorded.

**Stop** cancels the active turn and prevents all remaining records from starting. The popup retains the completed-record count after cancellation, including after reopening the conversation. To resume, enter that count as the **Start index** and run the action again. An interrupted record is not counted as completed.

With **Step by step** disabled, md² advances automatically after a record completes. With it enabled:

- **Send** continues the current record with another prompt;
- **Next** finishes the current record and starts the next one; and
- **Stop** cancels the current work and all remaining records.

When the agent has a pending question or approval, answer it before advancing. **Next** stays disabled while that interaction is unresolved.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The file is rejected | The selected file must have a `.json` name and contain valid JSON. |
| The object runs only once | Set **Path to list data** to the array inside the root object. |
| Setup reports that the path is not a list | The selected path exists but does not resolve to an array. |
| A record reports a missing data path | Check the path used by the selector or prompt against that record's shape. |
| No agent turn starts | The selected list may be empty, or the start index may be at or beyond its length. |
| A stopped run starts from the beginning | Set **Start index** to the completed-record count shown by the retained progress bar. |

For-each records run sequentially. The feature requires the desktop execution backend and does not run in web-only GitHub mode.

See also: [JSON data editor](../guide/json-data-editor.md), [Running actions](running-actions.md), [Placeholders](placeholders.md), [Actions and agents](../concepts/actions-and-agents.md).
