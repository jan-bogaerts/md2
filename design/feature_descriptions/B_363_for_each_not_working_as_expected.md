---
author: 
id: B_363
internalId: 18a123cb-87d4-4e30-883c-6336b8eaa574
title: for-each not working as expected
status: design
owner: 
affects:
agents:
policy:
---
we used the 'custom' or '+' action on the card which uses a streaming agent. We also used a for-each file with the action so that it should loop over every record in the file. The file contains an object, but we specified a path in the 'for-each' setup to the field that contains the actual array data. this worked for the first record, but then the conversation went into 'waitingForInput' mode. So I pressed the stop button and then the entire ag