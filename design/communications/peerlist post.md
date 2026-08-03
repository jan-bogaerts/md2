## How I’m speeding up development with agents using Git worktrees

Coding agents have changed how I work on software.&#x20;In the past, things could be handled pretty much sequentially, but these days, instead of completing one task before starting the next, I can have several features moving forward at the same time. Git worktrees make this practical because every agent can work in its own folder and branch without interfering with the others.

A typical workflow, for me, now looks something like this:

* create card, title and short description
* complete the card (agent runs the 'complete' prompt)
* assign the card to a worktree (branch is auto created, worktree updated)
* implement the card (agent runs the 'implememnt' prompt in the context of the worktree)
* verify implementation, manually (mostly viewing the diff), or with the 'verify implementation' prompt
* chat some with the agent to fix things
* merge worktree back into main project
* repeat until enough cards
* run the 'release' action which builds app, runs the 'write release notes' prompt, moves cards to release folder

While waiting for agents, a lot of other stuff can be done, features written out and stuff, other agents can be started on other tasks,...&#x20;

So when joggling with plenty of balls in the air, 2 things become important:&#x20;

* being able to separate the work and bring the results back together. This is what worktrees are for.
* easily keep track of the development state of the project, especially as agents can automatically change feature descriptions and the implementation state of the features.

Initially, this was a manual process for me, done with vscode, like most here I presume. But that didn't work very well. too many manual things to do, not enough overview. 2 features at a time was usually the max I could do.

That is why I built **MD²**.

MD² organises development around feature cards. Every conversation done within the context of the card, stays with the card, so no more searching through a list of conversation logs. A card can also be connected to a worktree, so everything done within the context of the card, is done on the worktree.
Also, everything is stored locally as Markdown or josn inside the repository, so agents can read and update the same project knowledge directly.

MD² is available as an open-source project:

GitHub: [https://github.com/jan-bogaerts/md2](https://github.com/jan-bogaerts/md2)
Peerlist launch: \[insert direct launch URL]

I would be interested to hear how others are coordinating agents across multiple features and worktrees.