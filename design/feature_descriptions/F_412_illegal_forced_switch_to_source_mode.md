---
author: 
id: F_412
internalId: e5a9c51e-b832-48b9-9e71-e83cc4468433
title: illegal forced switch to source mode
status: design
owner: 
affects:
agents:
policy:
---
we recently introduced source mode for the markdown editors. this appears to be giving unwanted side effects.

i tried to paste some text into the editor and we got this error:

`This content needs Source mode. The existing document is preserved; paste or insert it again in Source.`

and switched to source input.

* we showed this error, which is wrong
* it should not switch to source mode just like that

the text we tried to paste: simply wont be accepted anymore, paste it in source mode, when switching back to rich-text, we loose the text.

```
Uncaught Error Error: No fields to update
    at update (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\public\storage\sqlite\sqlite_bundle_events_log.js:133:19)
    at EventLogger._internalSave (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:349:57)
    --- await ---
    at <anonymous> (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:272:32)
    at _runSaveLoop (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:280:10)
    at <anonymous> (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:201:24)
    --- setTimeout ---
    at trySaveToDb (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:199:23)
    at updateEvent (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:97:18)
    at tryUpdateEvent (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\multi_event_detector.js:82:29)
    at _resolveAbsentDirections (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:139:18)
    at _handleFrame (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:110:14)
    at run (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:58:14)
    at _run (c:\Users\janbo\Documents\
```

the text started with: `& # x 60 ; & # x60 ; & #x60 ;` ( i put spaces between the letters so we can paste it in the editor without loosing it.

this is broken and bad experience. the editor should not switch, we should not show the error, should be able to paste the text,