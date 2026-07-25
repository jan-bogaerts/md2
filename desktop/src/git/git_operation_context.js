const { AsyncLocalStorage } = require('node:async_hooks');

const gitOperationStorage = new AsyncLocalStorage();

function currentGitOperationContext() {
    return gitOperationStorage.getStore() ?? {};
}

function runWithGitOperationContext(context, operation) {
    return gitOperationStorage.run(context, operation);
}

module.exports = { currentGitOperationContext, runWithGitOperationContext };
