## How I’m speeding up development with agents using Git worktrees

Coding agents have changed how I work on software.
In the past, things could be handled pretty much sequentilly, but these days, instead of completing one task before starting the next, I can have several features moving forward at the same time. Git worktrees make this practical because every agent can work in its own folder and branch without interfering with the others.

A typical workflow now looks something like this:

* create card, title and short description
*

I create a card for a feature and write down the initial requirements. If the feature is large enough, I add some design notes or ask an agent to investigate the existing code and prepare an implementation plan.

I then create or assign a worktree to the card and start an agent inside it. While that agent is implementing the feature, I can review another feature, prepare the next task, or start another agent in a different worktree.

The agent can update the card as it works: what it changed, decisions it made, remaining issues, and how the feature can be tested. Prompts, agent sessions, commits, notes, and token usage remain connected to that feature.

Once the implementation is ready, I review the changes, run the relevant checks, and ask the agent to address any remaining issues. The feature is then committed and merged, and the worktree can be reused or removed.

This lets me work on several parts of an application in parallel without mixing their code or context.

The difficult part was no longer creating worktrees. It was keeping track of them.

I regularly had many VS Code windows, terminals, branches, and agent sessions open. It became hard to remember which agent belonged to which feature, what had already been decided, and which task was ready for review.

That is why I built **MD²**.

MD² organises development around feature cards. A card can be connected to a worktree, coding-agent sessions, commits, actions, design notes, logs, and token usage. Everything is stored locally as Markdown inside the repository, so agents can read and update the same project knowledge directly.

It also provides a dashboard showing what is happening across the project, without having to switch through every editor window and terminal.

We have now released MD² as an open-source project:

GitHub: [https://github.com/jan-bogaerts/md2](https://github.com/jan-bogaerts/md2)
Peerlist launch: \[insert direct launch URL]

I would be interested to hear how others are coordinating agents across multiple features and worktrees.