---
author: 
id: F_246
internalId: 8df7d3db-c367-4792-b4f9-a9bd3ec9d674
title: add action diagram target
status: new
owner: 
affects:
agents:
policy:
after: 4ac8932f-6819-43c3-a9a6-e7623a05c279
---
We can link actions to different types of targets like cards, project, merge,... we need a new target: diagram. these actions are available in diagram mode.

See F\_262

A diagram action needs to inforce that the output is an svg and that the diagram skill is used.

To make this work, we add to project config section, a new config value ´diagram footer´, which is a markdown text added to every diagram prompt.

The prompt should contain instruction on where to save file, this is done with new placeholder ´diagram-file´

When action is started, we calculate filename and pass to prompt resolver.