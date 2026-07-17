const fs = require('node:fs');
const path = require('node:path');

const { ensureInsideRoot } = require('../git/git_commands');
const { conversationLogFilePath } = require('./project_log_paths');

const INTERMEDIATE_PERSIST_INTERVAL_MS = 250;

function agentLogFilePath(rootPath, projectFolder, scopePath, id) {
    return conversationLogFilePath(rootPath, projectFolder, scopePath, id);
}

function existingLogFilePath(rootPath, reference) {
    return ensureInsideRoot(rootPath, path.join(rootPath, reference));
}

async function persistConversation(filePath, conversation) {
    const temporaryPath = `${filePath}.tmp`;

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(conversation, null, 2)}\n`);
    await fs.promises.rename(temporaryPath, filePath);
}

function queueConversationPersist(run) {
    run.writeChain = run.writeChain.then(async () => persistConversation(run.filePath, run.conversation));

    return run.writeChain;
}

function clearIntermediatePersist(run) {
    if (!run.intermediatePersistTimer) return;

    clearTimeout(run.intermediatePersistTimer);
    run.intermediatePersistTimer = null;
}

function queueThrottledConversationPersist(run) {
    const now = Date.now();
    const elapsed = now - run.lastIntermediatePersistAt;
    if (elapsed >= INTERMEDIATE_PERSIST_INTERVAL_MS) {
        run.lastIntermediatePersistAt = now;

        return queueConversationPersist(run);
    }

    if (!run.intermediatePersistTimer) {
        const delay = INTERMEDIATE_PERSIST_INTERVAL_MS - elapsed;
        run.intermediatePersistTimer = setTimeout(() => {
            run.intermediatePersistTimer = null;
            run.lastIntermediatePersistAt = Date.now();
            void queueConversationPersist(run);
        }, delay);
    }

    return run.writeChain;
}

module.exports = {
    agentLogFilePath,
    clearIntermediatePersist,
    existingLogFilePath,
    persistConversation,
    queueConversationPersist,
    queueThrottledConversationPersist,
};
