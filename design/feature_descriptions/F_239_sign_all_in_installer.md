---
author: 
id: F_239
internalId: 1c141485-6431-438a-a4ca-9443f75443e2
title: sign all in installer
status: new
owner: 
affects:
agents:
policy:
---

We build an installer for the electron app. this gets signed by our own certificate. however, it seems we only sign the electron executable. When installing on a windows machine with full protection on, it complains that not all executables in this installer were signed. We have seen this before with another electron app. the solution was to sign all executable code in the package.

can you update the build script so we sign everything that needs to be signed?