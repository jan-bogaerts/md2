const fs = require('node:fs');
const path = require('node:path');

const { parseActivityValue } = require('../../../../shared/card_activity.mjs');
const {
    addSummaryUsage,
    agentTokenUsageFilePath,
    createAgentTokenUsageSummary,
    emptySummaryUsage,
    legacySummaryUsage,
    parseAgentTokenUsageSummary,
    parseSummaryUsage,
} = require('../../../../shared/agent_token_usage_summary.mjs');
const {
    loadActivityValue,
    queueActivityUpdate,
    resolveActivityPath,
    upsertConversation,
    writeActivityFile,
} = require('../activity/activity_files');
const { commitTrackedPaths, ensureInsideRoot, pathExists, requireRootPath } = require('../../git/git_commands');

const projectUsageWriteQueues = new Map();

function queueProjectUsageUpdate(filePath, update) {
    const previousWrite = projectUsageWriteQueues.get(filePath) ?? Promise.resolve();
    const write = previousWrite.then(update);
    const queueTail = write.catch(() => undefined);
    projectUsageWriteQueues.set(filePath, queueTail);
    void queueTail.finally(() => {
        if (projectUsageWriteQueues.get(filePath) === queueTail) projectUsageWriteQueues.delete(filePath);
    });

    return write;
}

function conversationSummaryUsage(conversation) {
    const usage = conversation?.usage;
    if (!usage) return emptySummaryUsage();
    if (conversation.usageSchemaVersion === undefined) return legacySummaryUsage(usage.totalTokens, usage.costUsd);

    return parseSummaryUsage({
        cachedInputTokens: usage.cachedInputTokens,
        ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
        inputTokens: usage.inputTokens,
        legacyTotalTokens: usage.legacyTotalTokens ?? 0,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
    }, 'conversation usage');
}

function usageDelta(previous, next) {
    const delta = {
        cachedInputTokens: next.cachedInputTokens - previous.cachedInputTokens,
        inputTokens: next.inputTokens - previous.inputTokens,
        legacyTotalTokens: next.legacyTotalTokens - previous.legacyTotalTokens,
        outputTokens: next.outputTokens - previous.outputTokens,
        reasoningTokens: next.reasoningTokens - previous.reasoningTokens,
        totalTokens: next.totalTokens - previous.totalTokens,
    };
    const invalidField = Object.entries(delta).find(([, value]) => !Number.isFinite(value) || value < 0);
    if (invalidField) throw new Error(`Agent conversation usage decreased: ${invalidField[0]}`);
    if (next.costUsd !== undefined || previous.costUsd !== undefined) {
        delta.costUsd = (next.costUsd ?? 0) - (previous.costUsd ?? 0);
        if (!Number.isFinite(delta.costUsd) || delta.costUsd < 0) throw new Error('Agent conversation cost decreased');
    }

    return delta;
}

function normalizedPath(value) {
    return value.replace(/\\/gu, '/');
}

function releaseNameForActivity(relativePath, releasesFolder) {
    const normalizedReleasesFolder = normalizedPath(releasesFolder).replace(/^\/+|\/+$/gu, '');
    const normalizedActivityPath = normalizedPath(relativePath);
    const prefix = `${normalizedReleasesFolder}/`;
    if (!normalizedActivityPath.startsWith(prefix)) return null;
    const releaseName = normalizedActivityPath.slice(prefix.length).split('/')[0];

    return releaseName.length > 0 ? releaseName : null;
}

async function cardActivityPaths(folderPath) {
    if (!await pathExists(folderPath)) return [];
    const paths = [];
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) paths.push(...await cardActivityPaths(entryPath));
        else if (/^card__.+\.json$/u.test(entry.name)) paths.push(entryPath);
    }

    return paths;
}

async function migrateSummary(rootPath, projectFolder, releasesFolder) {
    const absoluteProjectFolder = ensureInsideRoot(rootPath, path.join(rootPath, projectFolder));
    const activityPaths = await cardActivityPaths(absoluteProjectFolder);
    const projectUsages = [];
    const releaseUsages = new Map();
    for (const activityPath of activityPaths) {
        const activity = parseActivityValue(JSON.parse(await fs.promises.readFile(activityPath, 'utf8')));
        const costUsd = activity.conversations.reduce((total, conversation) => total + (conversation.usage?.costUsd ?? 0), 0);
        const hasCost = activity.conversations.some((conversation) => conversation.usage?.costUsd !== undefined);
        const totalTokens = activity.conversations.reduce((total, conversation) => total + (conversation.usage?.totalTokens ?? 0), 0);
        const usage = legacySummaryUsage(totalTokens, hasCost ? costUsd : undefined);
        projectUsages.push(usage);
        const relativePath = normalizedPath(path.relative(rootPath, activityPath));
        const releaseName = releaseNameForActivity(relativePath, releasesFolder);
        if (!releaseName) continue;
        releaseUsages.set(releaseName, [...(releaseUsages.get(releaseName) ?? []), usage]);
    }
    const releases = Object.fromEntries([...releaseUsages.entries()].map(([name, usages]) => [name, addSummaryUsage(usages)]));

    return createAgentTokenUsageSummary(addSummaryUsage(projectUsages), releases);
}

async function loadOrMigrateSummary(summaryPath, rootPath, projectFolder, releasesFolder) {
    if (await pathExists(summaryPath)) {
        return parseAgentTokenUsageSummary(await fs.promises.readFile(summaryPath, 'utf8'));
    }

    return migrateSummary(rootPath, projectFolder, releasesFolder);
}

async function restoreActivityFile(absolutePath, activityExisted, activity) {
    if (activityExisted) await writeActivityFile(absolutePath, activity);
    else await fs.promises.rm(absolutePath, { force: true });
}

async function persistConversationAndProjectUsage(run, dependencies = {}) {
    const { activityOrigin, activityProject, projectFolder, releasesFolder } = run.request;
    if (!activityProject) throw new Error('Missing agent activityProject');
    if (!activityOrigin) throw new Error('Missing agent activityOrigin');
    if (typeof projectFolder !== 'string') throw new Error('Missing agent projectFolder');
    if (typeof releasesFolder !== 'string') throw new Error('Missing agent releasesFolder');
    const rootPath = requireRootPath(activityProject);
    const summaryRelativePath = agentTokenUsageFilePath(projectFolder);
    const summaryPath = ensureInsideRoot(rootPath, path.join(rootPath, summaryRelativePath));
    const { absolutePath: activityPath, relativePath: activityRelativePath } = resolveActivityPath(
        rootPath,
        projectFolder,
        activityOrigin,
    );

    return queueProjectUsageUpdate(summaryPath, () => queueActivityUpdate(activityPath, async () => {
        const activityExisted = await pathExists(activityPath);
        const currentActivity = await loadActivityValue(activityPath, activityOrigin);
        const storedConversation = currentActivity.conversations.find(({ id }) => id === run.conversation.id) ?? null;
        const previousUsage = conversationSummaryUsage(storedConversation);
        const nextUsage = conversationSummaryUsage(run.conversation);
        const delta = usageDelta(previousUsage, nextUsage);
        const summary = await loadOrMigrateSummary(summaryPath, rootPath, projectFolder, releasesFolder);
        const nextSummary = {
            ...summary,
            projectUsage: addSummaryUsage([summary.projectUsage, delta]),
        };
        const nextActivity = upsertConversation(currentActivity, run.conversation);
        await writeActivityFile(activityPath, nextActivity);
        try {
            await writeActivityFile(summaryPath, nextSummary);
        } catch (error) {
            await restoreActivityFile(activityPath, activityExisted, currentActivity);
            throw error;
        }
        const commitPaths = dependencies.commitTrackedPaths ?? commitTrackedPaths;
        await commitPaths(rootPath, [activityRelativePath, summaryRelativePath], `Update ${activityOrigin.kind} activity`);

        return { activity: nextActivity, relativePath: activityRelativePath, summary: nextSummary };
    }));
}

module.exports = { conversationSummaryUsage, migrateSummary, persistConversationAndProjectUsage, usageDelta };
