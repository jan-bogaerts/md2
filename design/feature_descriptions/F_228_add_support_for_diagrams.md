---
author: 
id: F_228
internalId: ae7bdbef-7d85-4837-ba58-6ab382b218b0
title: add support for diagrams
status: new
owner: 
affects:
agents:
  - design/activity/card__ae7bdbef-7d85-4837-ba58-6ab382b218b0.json
policy:
after: b97071c8-d9a2-4039-8fbf-c313219a761c
---
analyze this site: [https://github.com/cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) on how diagrams are rendered.



what we need:

* new view containing:
  * component that renders an svg, handles clicking on it, renders tooltips,.. everything related to the diagram.
  * breadcrumb at top to switch between different types of diagrams (first crumb) and new crumb every time user clicks on an element that opens a new diagram. this is a way to navigate back or forward in the navigation tree.&#x20;
    should have a `back` button in front to go 1 step back. when at first step, disabled.



from agent conversation:

## Rendering approach

Diagram Design is an agent skill and template system, not a conventional diagram-rendering library with a structured diagram language. It generates self-contained HTML files containing inline SVG and CSS. Static, script-free output is the default; diagrams can also be exported as standalone SVG or rasterized to PNG.

## Feature direction

Add **Diagrams** as a workspace view alongside Board, List, and Stats. The view initially shows a default diagram that gives the user an entry point for exploring the project.

Users can generate additional diagrams through the action popup. Diagram generation requires a new diagram action type. Diagram actions automatically receive the Diagram Design skill or equivalent diagram-generation instructions as context. The exact context-injection mechanism is still to be determined; initially, it may be expressed through a shared action prompt.

A diagram can derive its content from a configured project source, such as modules, active cards, or another collection. Each interactive diagram item retains the text represented by that item so MD² can identify what the user selected.

The parent diagram definition can configure drill-down behavior for its items:

* the child diagram definition to show after an item is selected;
* the diagram action that loads the child diagram's data; and
* the selected item's text passed to that action as input.

The resulting child diagram follows the same model and can define another drill-down. Repeating this interaction lets users navigate from an overview into progressively more detailed diagrams and understand the project through its structure and relationships.



## Clickable SVG feasibility

Yes, SVG components can be clickable. The SVG [`<a>` element](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/a) can wrap text, shapes, or groups. For MD²'s drill-down behavior, inline SVG elements can instead carry safe identifiers or `data-*` attributes and be handled by an event listener owned by the application.

Application-owned event handling is the better fit because a click must run MD² behavior rather than navigate to a URL. It also avoids embedding executable event attributes or arbitrary scripts in agent-generated SVG. Diagram Design currently rejects event-handler attributes, executable URLs, and arbitrary scripts as part of its [security checks](https://github.com/cathrynlavery/diagram-design/blob/main/CONTRIBUTING.md), but that does not prevent MD² from attaching a listener after rendering a sanitized inline SVG.

Rendering the SVG as an ordinary Markdown image is insufficient for this interaction: the SVG remains visually available, but its internal nodes are not part of the parent document's DOM. The Diagrams view therefore needs an inline or otherwise application-controlled SVG rendering boundary.

The generated diagram needs an interaction contract that associates each clickable SVG item with at least:

* a stable item identifier;
* the item's displayed or source text; and
* the parent diagram's configured drill-down target.

Clickable items must also expose keyboard focus and an accessible name. The visual output remains usable when no drill-down is configured.

## Open design questions

* How diagram definitions, generated SVG, and interaction metadata are stored.
* How a diagram action receives the Diagram Design skill or shared generation instructions.
* How the selected item text is represented in the action context and prompt placeholders.
* How generated SVG is sanitized before it is inserted into the application DOM.
* Whether generated child diagrams are persisted, cached, or regenerated when opened.
* How users return to parent diagrams and see their current location in a drill-down chain.

## Diagram types useful for software development

### Software architecture and design

* **Architecture:** components, services, stores, external systems, and their connections.
* **IT current-state:** legacy systems grouped by phase or department for modernization work.
* **High-level:** a simplified end-to-end system or data-platform overview.
* **Layer stack:** application layers, abstractions, governance controls, or security defenses.
* **Nested:** system boundaries, scopes, ownership, and containment.
* **Tree:** file structures, syntax trees, configuration, or hierarchical data.
* **Dependency graph:** module, package, service, or build dependencies, including fan-in and cycles.
* **UML class:** classes, operations, inheritance, and composition in object-oriented designs.

### Behavior and interaction

* **Flowchart:** algorithms, validation, branching business logic, and policy evaluation.
* **Sequence:** time-ordered API calls, events, authentication, and asynchronous interactions.
* **State machine:** UI, workflow, job, connection, or domain-state lifecycles.
* **Swimlane:** processes involving several services, users, or teams, with explicit handoffs.
* **Process:** ordered multi-actor workflows and data handoffs.

### Data and runtime

* **ER / data model:** conceptual entities, fields, and relationships.
* **Database schema:** physical tables, types, constraints, indexes, and foreign keys.
* **Data flow:** how information moves and transforms through a system.
* **Deployment:** runtime zones, hosts, containers, artifacts, ports, and replicas.
* **Medallion:** bronze, silver, and gold analytical data layers.
* **DP integration:** data-platform sources, core services, and consumers.
* **DP security matrix:** permissions by role or component.
* **Sankey:** quantified traffic, cost, event, or data-volume movement through a system.

### Planning, product, and operations

* **Timeline:** incident reconstruction, migrations, release history, and other dated events.
* **Gantt:** release, migration, or infrastructure project planning.
* **Kanban:** work in progress, limits, states, and blocked work.
* **Story map:** user activities divided into features and release slices.
* **User journey:** user actions and experience across product stages.
* **Quadrant:** risk, impact, effort, or priority comparisons on two axes.
* **Fishbone:** grouped causes used for incident and defect root-cause analysis.
* **Wardley map:** value-chain evolution and build-versus-buy decisions.
* **Org chart:** code ownership, team responsibility, routing, and escalation.

Generic chart types are outside the scope of this feature.