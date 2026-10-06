---
author: 
id: B_261
internalId: 53a49b65-2678-4970-a708-27195fc179bc
title: broken toolcalls
status: design
owner: 
affects:
agents:
  - design/activity/card__53a49b65-2678-4970-a708-27195fc179bc.json
policy:
after: 45e13c03-d74d-4082-9065-aa387f6553f5
---
since recently, I see tool calls that remain in the 'running' state while there is 'output' available.

ex:

> "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Command 'npm test -- --watch\=…

**Status:** Running

### Command

```
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm test -- --watch=false --runInBand --runTestsByPath src/services/analysis/triggers/pipes/connections/__tests__/connections.test.js'
```

### Working directory

```
C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron
```

### Output

```

> vidsy@0.17.7 test
> react-scripts test src/services/analysis/triggers/pipes/connections/__tests__/connections.test.js

PASS src/services/analysis/triggers/pipes/connections/__tests__/connections.test.js
  ConnectionsDetection
    √ extends engine-managed and per-connection debounce timestamps (2 ms)
    √ retries each absent connection with its own copied gone box and updates only resolved Event (4 ms)
    √ includes an immediately resolved direction, including sector zero, in the created event (1 ms)
    √ retries unresolved direction and updates an existing event when it resolves
    √ does not calculate or replace direction after it resolves (1 ms)
    √ logs the main connection event separately from a broken connection event (1 ms)
    √ fills parent and defect distance from the first later valid reading (1 ms)
    √ logs blocked separately and latches it on the main connection event
    √ creates the over inserted event after consecutive visible detections (1 ms)
    √ updates a logged event when over inserted is detected while state is unresolved in-frame (1 ms)
    √ formats unresolved connections as detected
    √ formats resolved connections as complete (1 ms)
    √ formats resolved connections with pos ok as normal
    √ adds broken fill while keeping the resolved border state
    √ gates event creation on pos ok and keeps visible events active when pos ok disappears (3 ms)
    √ starts without pos ok when gating is disabled and closes after parent visibility debounce (1 ms)
    √ keeps a visible connection active when it loses its resolved state with view-ok gating disabled
    √ resumes the closest debouncing event within the vector cutoff (1 ms)
    √ resolves direction after an unresolved connection matches a new observation id
    √ does not resume a debouncing event when vector distance is above the replacement cutoff
    √ uses a 1.5x cutoff by default when one connection leaves frame and one new connection appears
    √ matches multiple outgoing and incoming connections using vector distance with the 1.5x cutoff (1 ms)
    √ uses the configured replacement similarity cutoff instead of the 1.5x default
    √ tracks multiple visible connections independently while logging broken separately (1 ms)
    √ updates formatting when visible connection status changes
    √ does not reformat when connection formatting inputs stay unchanged
    √ reformats without updating the event when only the observation id changes (1 ms)
    √ keeps type and state when later frames do not report them and pos ok gating is enabled
    √ extends the same broken connection event when broken returns after being gone (1 ms)
    √ reuses the blocked event and keeps the flag latched when blocked returns
    √ closes blocked with its tracked connection and resets the latch for a new connection
    √ drops normal formatting when pos ok is lost again
    √ broken flag latches permanently on main connection event (1 ms)
    √ captures distance when type and state become resolved across frames
    √ samples reported distance once on each stable visible frame
    √ captures one distance when initial frame resolves type, state, and view ok (1 ms)
    √ keeps first event distance when view ok changes the matching distance
    √ keeps captured distance when view-ok capture returns null
    √ preserves connection behavior when distance provider is missing (1 ms)
    √ resumes a pre-view-ok connection at the 0.1 m distance boundary (0.9)
    √ resumes a pre-view-ok connection at the 0.1 m distance boundary (1.1) (1 ms)
    √ creates a new connection when pre-view-ok distance differs by more than 0.1 m (0.89) (1 ms)
    √ creates a new connection when pre-view-ok distance differs by more than 0.1 m (1.11)
    √ uses vector-only matching when stored/current distance is unavailable (1, 1)
    √ uses vector-only matching when stored/current distance is unavailable (null, 1)
    √ uses vector-only matching when stored/current distance is unavailable (1, null) (1 ms)
    √ uses latched view-ok state for exact distance matching after v
[29162 characters omitted]
eeping the resolved border state
    √ gates event creation on pos ok and keeps visible events active when pos ok disappears
    √ starts without pos ok when gating is disabled and closes after parent visibility debounce (1 ms)
    √ keeps a visible connection active when it loses its resolved state with view-ok gating disabled
    √ resumes the closest debouncing event within the vector cutoff (1 ms)
    √ resolves direction after an unresolved connection matches a new observation id
    √ does not resume a debouncing event when vector distance is above the replacement cutoff
    √ uses a 1.5x cutoff by default when one connection leaves frame and one new connection appears (1 ms)
    √ matches multiple outgoing and incoming connections using vector distance with the 1.5x cutoff
    √ uses the configured replacement similarity cutoff instead of the 1.5x default (1 ms)
    √ tracks multiple visible connections independently while logging broken separately
    √ updates formatting when visible connection status changes
    √ does not reformat when connection formatting inputs stay unchanged
    √ reformats without updating the event when only the observation id changes
    √ keeps type and state when later frames do not report them and pos ok gating is enabled
    √ extends the same broken connection event when broken returns after being gone (1 ms)
    √ reuses the blocked event and keeps the flag latched when blocked returns (1 ms)
    √ closes blocked with its tracked connection and resets the latch for a new connection
    √ drops normal formatting when pos ok is lost again
    √ broken flag latches permanently on main connection event (1 ms)
    √ captures distance when type and state become resolved across frames
    √ samples reported distance once on each stable visible frame (1 ms)
    √ captures one distance when initial frame resolves type, state, and view ok (1 ms)
    √ keeps first event distance when view ok changes the matching distance
    √ keeps captured distance when view-ok capture returns null
    √ preserves connection behavior when distance provider is missing
    √ resumes a pre-view-ok connection at the 0.1 m distance boundary (0.9) (1 ms)
    √ resumes a pre-view-ok connection at the 0.1 m distance boundary (1.1)
    √ creates a new connection when pre-view-ok distance differs by more than 0.1 m (0.89)
    √ creates a new connection when pre-view-ok distance differs by more than 0.1 m (1.11)
    √ uses vector-only matching when stored/current distance is unavailable (1, 1) (1 ms)
    √ uses vector-only matching when stored/current distance is unavailable (null, 1)
    √ uses vector-only matching when stored/current distance is unavailable (1, null)
    √ uses latched view-ok state for exact distance matching after view ok disappears (1)
    √ uses latched view-ok state for exact distance matching after view ok disappears (1.01) (1 ms)
    √ ignores a distance-incompatible candidate and resumes the eligible candidate
    √ dimensions start with defaults when no laser measurement is present
    √ dimensions start with custom defaultWidth/defaultHeight config when no laser is present
    √ does not reserve pixel area before laser measurement exists (1 ms)
    √ preserves previous dimensions when laser measurement has no wall factor
    √ dimensions are converted via laser wall factor and snapped to nearest nominal size
    √ dimensions latch to the frame with the largest pixel area
    √ dimensions are calculated while the connection is being logged (1 ms)
    √ created connection event includes dimensions measured before logging
    √ logged connection updates only when resolved dimension values change
    √ dimensions are silently skipped when observation.box is absent
    √ only overwrites type and state when a stronger score is reported (1 ms)

Test Suites: 1 passed, 1 total
Tests:       60 passed, 60 total
Snapshots:   0 total
Time:        0.439 s, estimated 1 s
Ran all test suites matching /src\\services\\analysis\\triggers\\pipes\\connections\\__tests__\\connections.test.js/i.


```

similar: the app was stopped and restarted, but in the chatlog history, it still says that these tools are  running, which is not possible.

These are probably 2 different issues.