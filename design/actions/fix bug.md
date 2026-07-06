use /caveman skill
Read and implement the bug described in: 
`design\feature_descriptions\B_001_github_commit_stale_sha.md`

You do not need to look at the git status. This is not your concern.  The worktree is what it is, you only need to touch what is required for the above mentioned job/feature description.

Use the Block Workflow:

1. Propose a Change Plan with blocks (no edits yet).
2. create a task for each block
3. Wait for approval.
4. use a sub agent to implement each block. provide all the required info to the sub agent so he can implement the block in full.
5. include tests
6. After implementation is done, update the field `status` in the markdown feature description file to `ready`
7. Finally, print a 1 or 2 sentence commit statement for git. No need to do anything else for git, no need to commit.

You may read any files referenced by relative paths in the spec and any file you think is related to the spec.
Respect the Test Plan and Acceptance Criteria. Keep everything short and to the point.

