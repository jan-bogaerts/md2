---
author: 
id: B_315
internalId: 8a987dbe-da9b-4029-bfc6-0de9dee46a41
title: sequence does not detect that action is ready
status: design
owner: 
affects:
agents:
policy:
---

The first card in a sequence is ready. The 'ready' state was correctly detected. the action is also done, but the sequence runner did not detect that the action was ready. this is a problem. Now the sequence is stuck. what caused this?