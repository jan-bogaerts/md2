const {
    assertGitRoot,
    checkoutBranch,
    commit,
    ensureInsideRoot,
    listBranches,
    push,
    requireRootPath,
    runCommand,
    runGit,
} = require('./local_git_service_core')

module.exports = { assertGitRoot, checkoutBranch, commit, ensureInsideRoot, listBranches, push, requireRootPath, runCommand, runGit }
