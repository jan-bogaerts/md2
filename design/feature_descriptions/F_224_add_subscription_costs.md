---
author: 
id: F_224
internalId: 93f10274-10fd-48a2-9c07-bf50b9f970c8
title: add subscription costs
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__93f10274-10fd-48a2-9c07-bf50b9f970c8.json
policy:
after: 97733177-b4c8-47c3-af3d-64c31d4eca93
---
Allow the user to enter agent subscription costs so we can calculate things like:

* cost per card
* cost per action
* tokens per dollar (derived from tokens per % account usage).&#x20;

this allows the user to compare different configurations.

account cost should be configured from where the rest is configured for the agents: in the desktop config section.

prices are expressed per month

if we need to do complex time calculations, we can keep things perhaps simpler if we presume 4 weeks per month (28 days), that makes it easier.&#x20;

so if 100$ \= 100% account usage, 1% \= 1$