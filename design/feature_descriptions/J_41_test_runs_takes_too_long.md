---
author: 
id: J_41
internalId: e2ffca78-6736-4ef9-ab31-224364a9ae4c
title: test runs takes too long
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e2ffca78-6736-4ef9-ab31-224364a9ae4c.json
policy:
after: 25d602ba-1743-4365-b35d-08224cd0b98e
branch: j_41_test_runs_takes_too_long
worktree: 1
---

we have a serious issue on the test definitions. the full test for the react app takes over 3 minutes and just keeps running.

* app test :1.3s
* config: 10s
* actions: 37s
* card view 13s
* editor 5s
* shell: 38s
* text view: 22 s
* stat
* services.agents: 1.4s
* services.data: 1.6s
* services.project: 1.1s

we need to dramatically lower these numbers cause tests are taking too long. find out what the bottlenecks are and fix it or remove the tests