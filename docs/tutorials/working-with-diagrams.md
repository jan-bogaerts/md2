# Tutorial: working with diagrams

Generate diagrams from your code, drill into them, draw new ones, and hand diagram changes to an agent to implement. Diagrams are JSON files in the diagrams folder, committed like everything else.

Open the diagram view with **Diagrams** beside **Board** and **List**.

## 1. Render a diagram from code

An agent reads the codebase and writes the diagram. You need a root diagram action: an agent action with diagram applicability and diagram output.

{% raw %}
```json
{
  "id": "architecture",
  "label": "Architecture",
  "description": "Render an architecture diagram of the codebase",
  "type": "agent",
  "prompt": "Inspect the implemented codebase and extract its runtime components, stores, external systems, and the connections between them. Only include what the implementation supports.",
  "appliesTo": { "kind": "diagram", "type": "root" },
  "output": { "kind": "diagram" },
  "streaming": true,
  "autoFinish": { "when": "diagram-created" }
}
```
{% endraw %}

In the action editor: type **agent**, **Target kind** `diagram`, **Context type** `root`, output kind **Diagram**.

You do not describe the JSON format in the prompt. md² appends the project's diagram footer (`project.diagramFooter`), which tells the agent the file format and where to save it ({% raw %}`{{diagram-file}}`{% endraw %}). The application computes the layout.

Run it:

1. Press the diagram action button on the diagram view.
2. Pick the action and press **Run**.
3. With `autoFinish`, the run ends by itself when the diagram file is written. The diagram opens.

Write one action per diagram type you want: architecture, dependency, sequence, flow, entity, mindmap.

Reference: [Action definition](../actions/action-definition.md), [Placeholders](../actions/placeholders.md).

## 2. Drill down

A child diagram action renders a detailed diagram of one item. Same shape as above, with `"type": "child"` and {% raw %}`{{parent-node}}`{% endraw %} in the prompt:

{% raw %}
```json
"prompt": "Extract the detailed architecture of the selected item: \"{{parent-node}}\". Keep scope centered on it.",
"appliesTo": { "kind": "diagram", "type": "child" }
```
{% endraw %}

1. Open the context menu of an item in the diagram.
2. Run the child action. The new diagram is saved as a child of that item.
3. Next time, open the saved child diagram from the same menu.
4. Use the breadcrumbs to go back up, or to pick another root diagram.

**Emphasize** in the item menu focuses attention on an object.

## 3. Create a new diagram

To draw instead of generate:

1. **Home** tab → **New diagram**.
2. Pick the type: **Architecture**, **Dependency**, **Sequence**, **Flowchart**, **State diagram**, **Entity**, or **Mindmap**.
3. md² saves an empty diagram and opens the editor.
4. Use **Add** to place objects that fit the type: components, participants and fragments, steps and decisions, entities and relationships, topics.
5. Double-click an object to edit its details. **Select** and **Pan** switch between choosing and moving around.
6. Edit the diagram title and subtitle directly in the breadcrumb bar.

## 4. Edit and review

For a saved diagram, **Diagram** tab → **Edit diagram**. The editor shows **Current** (the saved source) next to **New** (your copy). Choose a vertical, horizontal, or tabbed comparison.

1. Change nodes, connections, groups, or fragments in **New**.
2. To repeat a node or connection's semantic formatting, copy one source object, select compatible targets, and press **Format Paste**. Choose **Legend**, **Kind**, or **Label**, then **Apply**.
3. Press **Add card to implement diagram**. Changes are grouped by diagram, nodes, connections, groups, and fragments. Selecting one highlights it.
4. Fix any blocking validation problems listed there.
5. **Save** writes the edited copy. The original stays available.

Reference: [Diagrams](../guide/diagrams.md).

## 5. Implement a diagram

Use a diagram as the specification: draw the change, then let an agent build it.

Turn the diagram into normal tracked work:

1. Edit the diagram (step 4) and press **Add card to implement diagram**.
2. Review the generated Markdown instructions. You can edit them directly in the dialog.
3. Change the default title (`implement <diagram title>`), card type, or target column if needed.
4. Press **Add card**.
5. Open the new card and run your normal implementation action.

For a newly drawn diagram, the instructions link to the complete diagram JSON even when the semantic-change list is empty. **Add card** does not save the diagram itself; press **Save** separately if you want to persist the edited copy.

## Next

Back to the [tutorial overview](../README.md#tutorials).
