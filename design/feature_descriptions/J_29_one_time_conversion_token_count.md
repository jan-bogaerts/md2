---
author: 
id: J_29
internalId: 48381c25-9fec-439b-9db0-321de114c33f
title: One time conversion token count
status: design
owner: 
affects:
agents:
  - design/activity/card__48381c25-9fec-439b-9db0-321de114c33f.json
policy:
after: 7fb7af14-458a-478c-9b9b-a0b3985214b2
---

Write a module that performs a one time conversion of the token counts on all the activity files in the project.

If the conversion cant be done exactly correct, do best effort.

Save data after conversion, file per file.

Save script in tools folder