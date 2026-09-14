---
author: 
id: B_227
internalId: e9560174-0ace-4098-9293-b0e60b449135
title: fix legend dragging
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__e9560174-0ace-4098-9293-b0e60b449135.json
policy:
after: 3e78e609-b7b9-496d-bc72-0826743d5d65
changedFiles:
  - app/src/components/diagram_view/diagram_action_popup.tsx
  - app/src/components/diagram_view/diagram_item_menu.tsx
  - app/src/components/diagram_view/diagram_legend.test.tsx
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_session_legend_entries.test.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
---

when on diagram view and user drags the legend around, repaint is very slow. it seems that the entire diagram is re-rendered while dragging. this should not be the case. the position of the legend should be something only the legend needs re-rendering for.

see attached performance trace, taken of a short drag, to see what is actually going on.

[Trace-20260908T153545.json](file:///C:/Users/janbo/Documents/dev/Trace-20260908T153545.json)