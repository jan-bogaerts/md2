## How I’m speeding up development with agents using Git worktrees

Coding agents have changed how I work on software.

In the past, development could be handled mostly sequentially. These days, instead of completing one task before starting the next, I can have several features moving forward at the same time.

Git worktrees make this practical because every agent can work in its own folder and branch without interfering with the others.

A typical workflow for me now looks like this:

* Create a card with a title and short description.
* Complete the card by having an agent run the `complete` prompt.
* Assign the card to a worktree. A branch is created automatically and the worktree is updated.
* Implement the card by running the `implement` prompt in the context of that worktree.
* Verify the implementation manually, usually by reviewing the diff, or by running the `verify implementation` prompt.
* Chat with the agent to fix any remaining issues.
* Merge the worktree back into the main project.
* Repeat until enough cards are ready.
* Run the `release` action, which builds the app, generates release notes, and moves the completed cards into the release folder.

While agents are working, I can do plenty of other things: write out new features, prepare cards, review changes, or start other agents on separate tasks.

When juggling that many things at once, two capabilities become important.

First, you need to separate the work and bring the results back together. That is what worktrees are for.

Second, you need to keep track of the development state of the project, especially when agents can update feature descriptions, plans, and implementation status themselves.

Initially, this was a mostly manual process using VS Code, as I suspect it is for many developers. It did not work very well for me. There were too many manual steps and not enough overview. Two features in parallel was usually about the maximum I could manage comfortably.

That is why I built **MD²**.

MD² organises development around feature cards. Every conversation started in the context of a card stays connected to that card, so there is no need to search through a long list of unrelated conversation logs.

A card can also be connected to a worktree, so actions and agent sessions started from that card run in the correct working context.

Everything is stored locally as Markdown or JSON inside the repository. Agents can read and update the same project knowledge directly, without relying on an external project-management service.

MD² is now available as an open-source project:

GitHub: [https://github.com/jan-bogaerts/md2](https://github.com/jan-bogaerts/md2)
Peerlist launch: \[insert direct launch URL]

I would be interested to hear how others are coordinating agents across multiple features and worktrees.