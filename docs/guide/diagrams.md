# Diagrams

Use **Diagrams** beside **Board** and **List** to explore a project visually. You can create an empty diagram in the editor or generate one with a diagram action. Diagrams are saved as JSON files in the configured diagrams folder.

## Create a diagram

Select **New diagram**, then choose **Architecture**, **Dependency**, **Sequence**, **Flowchart**, **State diagram**, **Entity**, or **Mindmap**. md² saves an empty root diagram and opens it for editing. Flowchart and State diagram are two presets of the flow diagram type.

The **Add** menu offers objects appropriate to the chosen type. For example, an entity diagram offers entities and relationships; a sequence diagram offers participants, connections, and fragments. A mindmap starts with a root, then offers topics. Use **Select** to choose objects or **Pan** to move around the surface. The Diagram tab also has cut, copy, paste, Format Paste, delete, metadata, legend, and formatting controls.

To generate a diagram with an agent or command, run a project-level diagram action from the diagram view. The action must target a diagram context and declare diagram output. Its prompt or command receives an output path through {% raw %}`{{diagram-file}}`{% endraw %}. See [Action definition](../actions/action-definition.md) and [Placeholders](../actions/placeholders.md).

## Explore saved diagrams

Open a saved root diagram from the diagram view. Select an item to make it active. Use its context menu to run a child diagram action or open a saved child diagram. Breadcrumbs show the current path and let you return to a parent or choose another root diagram; the current diagram's subtitle appears below them. While editing, change the current title and subtitle directly in this breadcrumb bar. The item menu also offers **Emphasize** to focus attention on an object.

## Edit and review

With a saved diagram open, choose **Edit diagram** on the **Diagram** tab. The editor shows **Current** (the source) and **New** (your editable version). On desktop, choose a vertical, horizontal, or tabbed comparison. On mobile, the comparison is tabbed. When you have just created an empty diagram, only **New** is shown.

Choose a tool from **Add** to place nodes, draw connections or groups, or add sequence fragments. Double-click a node, connection, or group to edit its details, or use the formatting controls. Moving, resizing, and changing diagram content appear in the change review; selection, pan, and zoom do not count as changes.

To copy semantic formatting, copy exactly one node or connection, select one or more objects of the same kind, and choose **Format Paste**. Select which available fields to apply: **Legend**, **Kind**, and **Label**. The operation updates all compatible selected targets together. Normal **Paste** still creates copied objects; Format Paste changes the existing selection and can be reused after one copy.

Select **Add card to implement diagram** to see changes grouped by diagram, nodes, connections, groups, and fragments. Selecting a change highlights its affected objects. The dialog also shows editable Markdown implementation instructions and any blocking validation problems.

Choose the card title, card type, and target column, then edit the instructions as needed. **Add card** creates a normal project card containing those instructions. For a newly created diagram, the instructions include a relative link to the complete diagram, so you can create an implementation card even when there are no remaining semantic changes. The dialog is resizable on desktop.

**Save** writes an edited copy. The original diagram remains available, and later saves in the same edit session update that copy. Saving and adding the implementation card are separate actions: adding a card does not save diagram edits, and closing the dialog does neither.

## Diagram files and settings

Diagrams are structured JSON, not SVG images. The default folder is `design/diagrams` when the project folder uses its default `design`; change it with `project.diagramsFolder`. `project.diagramFooter` supplies the instructions appended to diagram action prompts and must include {% raw %}`{{diagram-file}}`{% endraw %}. See [Configuration](configuration.md) and [Project layout](../concepts/project-layout.md).
