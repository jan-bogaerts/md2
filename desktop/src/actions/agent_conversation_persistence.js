const fs = require('node:fs')
const path = require('node:path')

const { ensureInsideRoot } = require('../git/git_commands')

const AGENT_LOG_FOLDER = '.md2-agent-logs'
const INTERMEDIATE_PERSIST_INTERVAL_MS = 250

function safePathSegment(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function agentLogFilePath(rootPath, scopePath, id) {
    const folderPath = ensureInsideRoot(rootPath, path.join(rootPath, AGENT_LOG_FOLDER))
    const fileName = `${safePathSegment(scopePath)}_${safePathSegment(id)}.json`

    return ensureInsideRoot(rootPath, path.join(folderPath, fileName))
}

function existingLogFilePath(rootPath, reference) {
    return ensureInsideRoot(rootPath, path.join(rootPath, reference))
}

async function persistConversation(filePath, conversation) {
    const temporaryPath = `${filePath}.tmp`

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(conversation, null, 2)}\n`)
    await fs.promises.rename(temporaryPath, filePath)
}

function queueConversationPersist(run) {
    run.writeChain = run.writeChain.then(async () => persistConversation(run.filePath, run.conversation))

    return run.writeChain
}

function clearIntermediatePersist(run) {
    if (!run.intermediatePersistTimer) return

    clearTimeout(run.intermediatePersistTimer)
    run.intermediatePersistTimer = null
}

function queueThrottledConversationPersist(run) {
    const now = Date.now()
    const elapsed = now - run.lastIntermediatePersistAt
    if (elapsed >= INTERMEDIATE_PERSIST_INTERVAL_MS) {
        run.lastIntermediatePersistAt = now

        return queueConversationPersist(run)
    }

    if (!run.intermediatePersistTimer) {
        const delay = INTERMEDIATE_PERSIST_INTERVAL_MS - elapsed
        run.intermediatePersistTimer = setTimeout(() => {
            run.intermediatePersistTimer = null
            run.lastIntermediatePersistAt = Date.now()
            void queueConversationPersist(run)
        }, delay)
    }

    return run.writeChain
}

module.exports = {
    agentLogFilePath,
    clearIntermediatePersist,
    existingLogFilePath,
    persistConversation,
    queueConversationPersist,
    queueThrottledConversationPersist,
}
