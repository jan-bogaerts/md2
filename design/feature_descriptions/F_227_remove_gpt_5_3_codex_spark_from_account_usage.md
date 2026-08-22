---
author: 
id: F_227
internalId: 269f5e9f-dbe4-4818-bd5a-7915bba398af
title: remove GPT-5-3-Codex-Spark from account usage
status: design
owner: 
affects:
agents:
policy:
---

for codex, we currently still show account usage for `GPT-5.3-Codex-Spark` . we don't support this model in the app, so no need to show account usage for this, also no need to track it. in fact, this may be removed everywhere that it might be used in code (ex: charts)