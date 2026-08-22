---
author: 
id: F_239
internalId: 1c141485-6431-438a-a4ca-9443f75443e2
title: sign all in installer
status: design
owner: 
affects:
agents:
  - design/activity/card__1c141485-6431-438a-a4ca-9443f75443e2.json
policy:
after: 2e5a2329-ae2b-4afa-9d93-7d77c7b25b89
---

We build an installer for the electron app. this gets signed by our own certificate. however, it seems we only sign the electron executable. When installing on a windows machine with full protection on, it complains that not all executables in this installer were signed. We have seen this before with another electron app. the solution was to sign all executable code in the package.

can you update the build script so we sign everything that needs to be signed?