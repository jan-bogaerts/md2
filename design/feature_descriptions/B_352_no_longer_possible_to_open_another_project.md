---
author: 
id: B_352
internalId: cf8beb58-a0c5-4116-a93f-a3d52a377175
title: no longer possible to open another project
status: design
owner: 
affects:
agents:
  - design/activity/card__cf8beb58-a0c5-4116-a93f-a3d52a377175.json
policy:
---

Started md2 in debug mode, opened a project automatically, wanted to open another project, got this error:

> Command failed: git check-ignore -z -- design/active/F_5_sphere_defense_cv.md design/usage_metrics.csv
> fatal: -z only makes sense with --stdin

can no longer open another project.

also, what is the purpose of the git command when opening a project?