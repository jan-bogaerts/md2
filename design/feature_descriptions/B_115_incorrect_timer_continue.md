---
author: 
id: B_115
internalId: 2433b65f-efed-4a22-af41-529cd35af655
title: incorrect timer continue
status: design
owner: 
affects:
agents:
  - design/activity/card__2433b65f-efed-4a22-af41-529cd35af655.json#conversation=agent-48c25526-8ac6-4cc0-9649-5a68d27443fe
policy:
---

it seems that the timer just never stops. when a timer has been paused cause of waiting for input or any other state not running and the timer is then started again cause of new input, it seems the timer just adds the time in between to the time. so it seems that somewhere we store when the time was stopped and then when it starts again, we take the difference between last stop and restart and add that time to the timer. this is so so so wrong.

this is how the timer needs to work:

* start agent: start time from 0
* agent is running: increment timer
* agent pauses (any other state then running): timer is stopped, ex at 10 seconds
* new input is given, so timer start again, from 10
* agent runs again for 10 seconds, so total time \= 20 seconds