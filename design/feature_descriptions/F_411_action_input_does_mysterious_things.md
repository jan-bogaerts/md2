---
author: 
id: F_411
internalId: 3a49a2cb-5483-4a08-ab90-d111b22586cd
title: action input does mysterious things
status: ready
owner: 
affects:
agents:
  - design/activity/card__3a49a2cb-5483-4a08-ab90-d111b22586cd.json
policy:
after: 7df9f053-e015-45b7-ba7a-9f4f0945ef60
changedFiles:
  - .agent_catalog_cleanup.py
  - .agent_catalog_followup.py
  - .agent_catalog_tests.py
  - .agent_cleanup.py
  - .agent_cleanup_final_checks.py
  - .agent_cleanup_fixes.py
  - .agent_notification_checks.py
  - app/src/App.test.tsx
  - app/src/app/use_app_bootstrap.test.ts
  - app/src/components/actions/run/popup/action_popup_bottom_row.grouped.test.tsx
  - app/src/components/actions/run/popup/catalog_refresh_verification.test.tsx
  - app/src/components/hooks/use_agent_model_catalog.test.tsx
  - app/src/services/agents/agent_capabilities_service.service.test.ts
  - app/src/services/agents/agent_capabilities_service.ts
  - app/src/services/application_startup_service.ts
  - desktop/src/actions/agent/agent_model_catalog_service.js
  - desktop/src/actions/agent/agent_model_catalog_service.test.mjs
---

I was just typing something into the input of the action-popup for a new conversation. Yet for a very short period something appeared in the chatlog and then disappeared again.

This is very strange and unexpected behavior. Clearly the app is doing something in the background that it shouldn't. Can you find what this can be?

I tried to make a trace, but it didn't occur during the creation of the trace: [Trace-type-action-input.json](file:///C:/Users/janbo/Documents/dev/Trace-type-action-input.json)