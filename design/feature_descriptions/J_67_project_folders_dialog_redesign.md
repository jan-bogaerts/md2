---
author: 
id: J_67
internalId: ad646cb9-3521-4a35-ae1b-7fdaa2701547
title: project folders dialog redesign
status: design
owner: 
affects:
agents:
policy:
---
see:

<img height="363" width="315" alt="pasted image" src="pasted-image-93dd1734-6210-40c8-b4b4-b5489b65820a.png" />

it does not look good, it has a poor overview: no cards are used to group things nicely together (see [config_subsection.tsx](app/src/components/config/config_subsection.tsx)). It is very hard to see that we are dealing with 'inputs' and what belongs with what. also, I think there is a helper text, but with 1 or 2 words, that's meaningless. we need to provide proper sentences with a proper explanation what the folder is for, what it contains. Finally, has the 'TextField' component been used for these inputs or was this some home made thing? please make certain we use the correct components here.