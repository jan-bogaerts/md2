---
author: 
id: J_52
internalId: d35077d6-dd5e-4bba-a00b-ad28b7e7df70
title: speed up creating new cards
status: design
owner: 
affects:
agents:
  - design/activity/card__d35077d6-dd5e-4bba-a00b-ad28b7e7df70.json
policy:
changedFiles:
  - app/src/components/card_view/project_card_view.tsx
  - app/src/components/shell/project/new_card_dialog.tsx
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/services/data/card_archive_operations.ts
  - app/src/services/data/card_operation_context.ts
  - app/src/services/data/card_operations.test.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/data/data_service.ts
  - app/src/services/project/project_session_service.service.test.ts
  - app/src/services/project/project_session_service.ts
  - app/src/services/project/project_state.node.test.ts
  - app/src/services/project/project_state.ts
---

analyze this performance trace: [Trace-new card.json](file:///C:/Users/janbo/Documents/dev/Trace-new%20card.json), which was taken while creating a new card. it takes a long time and it appears a lot is done, which is strange cause it should be a fairly simple operation. only 1 column should reresh.