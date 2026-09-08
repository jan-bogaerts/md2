---
author: 
id: B_225
internalId: ad96a8b4-de34-44c9-9761-c2834fd8710a
title: polling claude not working correctly
status: ready
owner: 
affects:
agents:
  - design/activity/card__ad96a8b4-de34-44c9-9761-c2834fd8710a.json
policy:
---

here are the logs we got from claude usage polling:

> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2514,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:04:27.472Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57529,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:05:22.487Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2213,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:06:27.181Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 7pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57215,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:07:22.183Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2232,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:08:27.211Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57234,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:09:22.213Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2245,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:10:27.238Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 7pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57248,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:11:22.241Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2191,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:12:27.195Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 7pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57199,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:13:22.204Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2273,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:14:27.291Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57281,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:15:22.299Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2162,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:16:27.190Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 7pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57167,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:17:22.195Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2226,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:18:27.270Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 7pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57231,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:19:22.275Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2241,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:20:27.297Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57247,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:21:22.303Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2477,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:22:27.542Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57483,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:23:22.548Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2172,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:24:27.250Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57182,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:25:22.260Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2205,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:26:27.295Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57216,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:27:22.306Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2323,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:28:27.429Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57329,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:29:22.435Z'
> }
> \[claude:usage-poll] {
> attempt: 'stdout',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 2299,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'stdout-unparsed',
> timestamp: '2026-09-08T08:30:27.417Z',
> screenExcerpt: 'You are currently using your subscription to power your Claude Code usage\n' +
> 'Current session: 0% used\n' +
> 'Current week (all models): 1% used · resets Sep 13, 6:59pm (Europe/Brussels)'
> }
> \[claude:usage-poll] {
> attempt: 'pty',
> cwd: 'C:\Users\janbo\Documents\dev\md2',
> elapsedMs: 57302,
> executable: 'C:\Program Files\nodejs\claude.cmd',
> reason: 'pty-host-deadline',
> timestamp: '2026-09-08T08:31:22.420Z'
> }

we are clearly getting the proper response but our parser isn't finding it. investigate the problem, report how it works currently and how you would fix it.