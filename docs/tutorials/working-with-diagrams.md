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

## 4. Edit and review

For a saved diagram, **Diagram** tab → **Edit diagram**. The editor shows **Current** (the saved source) next to **New** (your copy). Choose a vertical, horizontal, or tabbed comparison.

1. Change nodes, connections, groups, or fragments in **New**.
2. Press **Review**. Changes are grouped by diagram, nodes, connections, groups, and fragments. Selecting one highlights it.
3. Fix any blocking validation problems listed there.
4. **Save** writes the edited copy. The original stays available.

Reference: [Diagrams](../guide/diagrams.md).

## 5. Implement a diagram

Use a diagram as the specification: draw the change, then let an agent build it.

Create an implement action for reviewed diagram changes. It applies to root diagrams and has no diagram output, because it changes code, not the diagram:

{% raw %}
```json
{
  "id": "implement-diagram-changes",
  "label": "Implement diagram changes",
  "description": "Implement the reviewed diagram changes in the codebase",
  "type": "agent",
  "prompt": "Implement the following changes to the system, as drawn in the diagram:\n\n{{diagram-changes}}\n\nPropose a plan first and wait for approval.",
  "appliesTo": { "kind": "diagram", "type": "root" },
  "streaming": true
}
```
{% endraw %}

Then:

1. Edit the diagram (step 4) and press **Review**.
2. Press **Send to agent**. The action popup opens with the reviewed changes attached.
3. Pick the implement action and press **Run**.

{% raw %}`{{diagram-changes}}`{% endraw %} holds the generated change text from the review. It only resolves after **Send to agent**: the same action started from the diagram action button fails before it runs. **Send to agent** does not save the diagram; press **Save** as well if you want to keep the drawing.

For larger work, write the change into a card instead and link the diagram from it, so the implementation follows the normal card process ([Working with cards](working-with-cards.md)).

## Next

Back to the [tutorial overview](../README.md#tutorials).
