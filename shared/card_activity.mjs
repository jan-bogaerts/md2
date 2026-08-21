import { parseAgentConversationValue } from './agent_conversations.mjs';
import { validateAgentSelectionState } from './agent_selection.mjs';

const ACTIVITY_VERSION = 5;
export const LEGACY_ACTIVITY_VERSION = 1;
export const SECOND_ACTIVITY_VERSION = 2;
export const THIRD_ACTIVITY_VERSION = 3;
export const PREVIOUS_ACTIVITY_VERSION = 4;
const ACTION_ACTIVITY_STATUSES = new Set(['cancelled', 'completed', 'failed', 'okButNotAfter']);

function requiredString(value, fieldName, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`Malformed activity file: missing ${fieldName}`);

    return value;
}

function requiredTimestamp(value, fieldName) {
    const timestamp = requiredString(value, fieldName);
    if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Malformed activity file: invalid ${fieldName}`);

    return timestamp;
}

function nonNegativeInteger(value, fieldName) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Malformed activity file: invalid ${fieldName}`);

    return value;
}

function requiredStringArray(value, fieldName) {
    if (!Array.isArray(value)) throw new Error(`Malformed activity file: invalid ${fieldName}`);

    return value.map((entry, index) => requiredString(entry, `${fieldName}[${index}]`));
}

function parseOrigin(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: missing origin');
    if (value.kind === 'project') return { kind: 'project' };
    if (value.kind !== 'card') throw new Error(`Malformed activity file: invalid origin kind ${String(value.kind)}`);

    return { cardInternalId: requiredString(value.cardInternalId, 'origin.cardInternalId'), kind: 'card' };
}

function parseActionSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed activity file: actionSettings must be an object');
    }

    return Object.fromEntries(Object.entries(value).map(([actionId, settings]) => {
        if (actionId.length === 0) throw new Error('Malformed activity file: actionSettings action ID must not be empty');
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error(`Malformed activity file: invalid actionSettings.${actionId}`);
        }

        if (settings.accessLevel !== undefined || settings.approvalPolicy !== undefined
            || settings.agent !== undefined || settings.model !== undefined || settings.thinkingLevel !== undefined) {
            throw new Error(`Malformed activity file: obsolete permission fields in actionSettings.${actionId}`);
        }

        return [actionId, validateAgentSelectionState(settings, `actionSettings.${actionId}`, true)];
    }));
}

function sameOrigin(first, second) {
    return first.kind === second.kind && first.cardInternalId === second.cardInternalId;
}

function parseCommit(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid commits[${index}]`);
    const commit = {
        branch: requiredString(value.branch, `commits[${index}].branch`),
        commit: requiredString(value.commit, `commits[${index}].commit`),
        committedAt: requiredTimestamp(value.committedAt, `commits[${index}].committedAt`),
        deletions: nonNegativeInteger(value.deletions, `commits[${index}].deletions`),
        filePaths: requiredStringArray(value.filePaths, `commits[${index}].filePaths`),
        filesChanged: nonNegativeInteger(value.filesChanged, `commits[${index}].filesChanged`),
        insertions: nonNegativeInteger(value.insertions, `commits[${index}].insertions`),
    };
    if (!/^[0-9a-f]{40}$/iu.test(commit.commit)) throw new Error(`Malformed activity file: invalid commits[${index}].commit`);
    if (value.available !== undefined) {
        if (typeof value.available !== 'boolean') throw new Error(`Malformed activity file: invalid commits[${index}].available`);
        commit.available = value.available;
    }
    if (value.actionId !== undefined || value.actionName !== undefined) {
        commit.actionId = requiredString(value.actionId, `commits[${index}].actionId`);
        commit.actionName = requiredString(value.actionName, `commits[${index}].actionName`);
    }

    return commit;
}

function parseLegacyHistory(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].history`);
    const status = requiredString(value.status, `records[${index}].history.status`);
    if (status !== 'completed' && status !== 'failed') throw new Error(`Malformed activity file: invalid records[${index}].history.status`);
    const history = {
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].history.completedAt`),
        output: requiredString(value.output, `records[${index}].history.output`, true),
        prompt: requiredString(value.prompt, `records[${index}].history.prompt`, true),
        status,
    };
    for (const fieldName of ['accessLevel', 'agent', 'approvalPolicy', 'command', 'model', 'thinkingLevel']) {
        if (value[fieldName] === undefined) continue;
        if (fieldName === 'agent' && value[fieldName] === null) history[fieldName] = null;
        else history[fieldName] = requiredString(value[fieldName], `records[${index}].history.${fieldName}`);
    }

    return history;
}

function parseAgentDetails(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].details`);
    const details = { type: 'agent' };
    if (value.accessLevel !== undefined || value.approvalPolicy !== undefined) {
        throw new Error(`Malformed activity file: obsolete permission fields in records[${index}].details`);
    }
    for (const fieldName of ['agent', 'model', 'permissionMode', 'thinkingLevel']) {
        if (value[fieldName] === undefined) continue;
        if (fieldName === 'agent' && value[fieldName] === null) details[fieldName] = null;
        else details[fieldName] = requiredString(value[fieldName], `records[${index}].details.${fieldName}`);
    }

    return details;
}

function parseCommandDetails(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].details`);

    return {
        command: requiredString(value.command, `records[${index}].details.command`, true),
        output: requiredString(value.output, `records[${index}].details.output`, true),
        type: 'command',
    };
}

function parseDetails(value, index) {
    if (value?.type === 'agent') return parseAgentDetails(value, index);
    if (value?.type === 'command') return parseCommandDetails(value, index);

    throw new Error(`Malformed activity file: invalid records[${index}].details.type`);
}

function parseSystemRecord(value, index, activityOrigin) {
    if (!Array.isArray(value.commits) || value.commits.length !== 1) {
        throw new Error(`Malformed activity file: system records[${index}].commits must contain one commit`);
    }
    const origin = parseOrigin(value.origin);
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`);

    return {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        label: requiredString(value.label, `records[${index}].label`),
        origin,
        type: 'system',
    };
}

function parseRecord(value, index, activityOrigin) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}]`);
    if (value.type === 'system') return parseSystemRecord(value, index, activityOrigin);
    const status = requiredString(value.status, `records[${index}].status`);
    if (!ACTION_ACTIVITY_STATUSES.has(status)) throw new Error(`Malformed activity file: invalid records[${index}].status`);
    if (!Array.isArray(value.commits)) throw new Error(`Malformed activity file: invalid records[${index}].commits`);
    if (!Array.isArray(value.conversationIds)) throw new Error(`Malformed activity file: invalid records[${index}].conversationIds`);

    const origin = parseOrigin(value.origin);
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`);

    if (value.history !== undefined) throw new Error(`Malformed activity file: records[${index}].history is not supported`);
    const details = parseDetails(value.details, index);
    if (details.type === 'command' && value.rootConversationId !== undefined) {
        throw new Error(`Malformed activity file: command records[${index}] cannot have rootConversationId`);
    }
    const record = {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        conversationIds: requiredStringArray(value.conversationIds, `records[${index}].conversationIds`),
        details,
        runId: requiredString(value.runId, `records[${index}].runId`),
        origin,
        rootActionId: requiredString(value.rootActionId, `records[${index}].rootActionId`),
        rootActionLabel: requiredString(value.rootActionLabel, `records[${index}].rootActionLabel`),
        startedAt: requiredTimestamp(value.startedAt, `records[${index}].startedAt`),
        status,
    };
    if (details.type === 'agent') record.rootConversationId = requiredString(value.rootConversationId, `records[${index}].rootConversationId`);

    return record;
}

function parseLegacyRecord(value, index, activityOrigin) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}]`);
    if (value.type === 'system') return parseSystemRecord(value, index, activityOrigin);
    const status = requiredString(value.status, `records[${index}].status`);
    if (!ACTION_ACTIVITY_STATUSES.has(status)) throw new Error(`Malformed activity file: invalid records[${index}].status`);
    if (!Array.isArray(value.commits)) throw new Error(`Malformed activity file: invalid records[${index}].commits`);
    const origin = parseOrigin(value.origin);
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`);

    return {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        conversationIds: requiredStringArray(value.conversationIds, `records[${index}].conversationIds`),
        history: parseLegacyHistory(value.history, index),
        origin,
        rootActionId: requiredString(value.rootActionId, `records[${index}].rootActionId`),
        rootActionLabel: requiredString(value.rootActionLabel, `records[${index}].rootActionLabel`),
        runId: requiredString(value.runId, `records[${index}].runId`),
        startedAt: requiredTimestamp(value.startedAt, `records[${index}].startedAt`),
        status,
    };
}

function parseConversation(value, index, activityOrigin) {
    try {
        const parsed = parseAgentConversationValue(value, '');
        const expectedCardInternalId = activityOrigin.kind === 'card' ? activityOrigin.cardInternalId : null;
        if (parsed.cardInternalId !== expectedCardInternalId) throw new Error('conversation cardInternalId does not match activity origin');

        return Object.fromEntries(Object.entries(parsed).filter(([fieldName]) => fieldName !== 'path'));
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid conversation';
        throw new Error(`Malformed activity file: conversations[${index}] ${detail}`, { cause: error });
    }
}

function repairConversation(value, index, activityOrigin) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Array.isArray(value.entries) ? value.entries.filter((entry) => {
        try {
            parseAgentConversationValue({ ...value, entries: [entry] }, '');

            return true;
        } catch {
            return false;
        }
    }) : [];

    try {
        return parseConversation({ ...value, entries }, index, activityOrigin);
    } catch {
        return null;
    }
}

export function createActivityFile(origin) {
    return { actionSettings: {}, conversations: [], origin: parseOrigin(origin), records: [], version: ACTIVITY_VERSION };
}

export function parseActivityValue(value, expectedOrigin = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: root must be an object');
    if (value.version !== ACTIVITY_VERSION) throw new Error(`Malformed activity file: unsupported version ${String(value.version)}`);
    if (!Array.isArray(value.records)) throw new Error('Malformed activity file: records must be an array');
    if (!Array.isArray(value.conversations)) throw new Error('Malformed activity file: conversations must be an array');
    const actionSettings = parseActionSettings(value.actionSettings);
    const origin = parseOrigin(value.origin);
    if (expectedOrigin) {
        const expected = parseOrigin(expectedOrigin);
        if (!sameOrigin(origin, expected)) {
            throw new Error('Malformed activity file: origin does not match requested activity');
        }
    }

    const conversations = value.conversations.map((conversation, index) => parseConversation(conversation, index, origin));
    const records = value.records.map((record, index) => parseRecord(record, index, origin));
    for (const [index, record] of records.entries()) {
        if (record.type === 'system' || record.details.type !== 'agent') continue;
        if (!record.conversationIds.includes(record.rootConversationId)) {
            throw new Error(`Malformed activity file: records[${index}].rootConversationId is not in conversationIds`);
        }
        const conversation = conversations.find(({ id }) => id === record.rootConversationId);
        if (!conversation) throw new Error(`Malformed activity file: records[${index}].rootConversationId does not resolve`);
        if (conversation.actionId !== record.rootActionId) {
            throw new Error(`Malformed activity file: records[${index}].rootConversationId action does not match rootActionId`);
        }
    }

    return {
        actionSettings,
        conversations,
        origin,
        records,
        version: ACTIVITY_VERSION,
    };
}

function legacyPermissionMode(agent, accessLevel, approvalPolicy, fieldName) {
    if (accessLevel === undefined && approvalPolicy === undefined) return undefined;
    if (agent === 'codex' && accessLevel === 'workspace-write' && approvalPolicy === 'on-request') return 'ask-for-approval';
    if (agent === 'codex' && accessLevel === 'danger-full-access' && approvalPolicy === 'never') return 'full-access';
    if (agent === 'claude' && (accessLevel === undefined || accessLevel === '')) {
        if (approvalPolicy === 'acceptEdits') return 'ask-for-approval';
        if (approvalPolicy === 'auto') return 'approve-for-me';
        if (approvalPolicy === 'bypassPermissions') return 'full-access';
    }

    throw new Error(`Cannot migrate activity file: unrecognised legacy permission combination in ${fieldName}`);
}

function migrateVersionThreeActionSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed activity file: actionSettings must be an object');
    }

    return Object.fromEntries(Object.entries(value).map(([actionId, settings]) => {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error(`Malformed activity file: invalid actionSettings.${actionId}`);
        }
        const permissionMode = legacyPermissionMode(
            settings.agent,
            settings.accessLevel,
            settings.approvalPolicy,
            `actionSettings.${actionId}`,
        );

        return [actionId, {
            agent: requiredString(settings.agent, `actionSettings.${actionId}.agent`, true),
            model: requiredString(settings.model, `actionSettings.${actionId}.model`, true),
            ...(permissionMode !== undefined ? { permissionMode } : { permissionMode: '' }),
            thinkingLevel: requiredString(settings.thinkingLevel, `actionSettings.${actionId}.thinkingLevel`, true),
        }];
    }));
}

function migrateVersionFourActionSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed activity file: actionSettings must be an object');
    }

    return Object.fromEntries(Object.entries(value).map(([actionId, settings]) => {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error(`Malformed activity file: invalid actionSettings.${actionId}`);
        }
        const activeAgent = requiredString(settings.agent, `actionSettings.${actionId}.agent`, true);
        if (activeAgent.length === 0) throw new Error(`Malformed activity file: missing actionSettings.${actionId}.agent`);

        return [actionId, {
            activeAgent,
            permissionMode: requiredString(settings.permissionMode, `actionSettings.${actionId}.permissionMode`, true),
            settingsByAgent: {
                [activeAgent]: {
                    model: requiredString(settings.model, `actionSettings.${actionId}.model`, true),
                    thinkingLevel: requiredString(settings.thinkingLevel, `actionSettings.${actionId}.thinkingLevel`, true),
                },
            },
        }];
    }));
}

function migrateLegacyRecord(record, index, conversations) {
    if (record.type === 'system') return record;
    const { history, ...base } = record;
    const agentRecord = history.agent !== undefined
        || history.accessLevel !== undefined
        || history.approvalPolicy !== undefined
        || history.model !== undefined
        || history.thinkingLevel !== undefined;
    if (!agentRecord) {
        return {
            ...base,
            details: { command: history.command ?? '', output: history.output, type: 'command' },
        };
    }

    const candidates = conversations.filter((conversation) => (
        record.conversationIds.includes(conversation.id) && conversation.actionId === record.rootActionId
    ));
    if (candidates.length !== 1) {
        throw new Error(`Cannot migrate activity file: agent records[${index}] has ${candidates.length} matching root conversations`);
    }
    const permissionMode = legacyPermissionMode(
        history.agent,
        history.accessLevel,
        history.approvalPolicy,
        `records[${index}].history`,
    );
    const details = Object.fromEntries(Object.entries({
        agent: history.agent,
        model: history.model,
        permissionMode,
        thinkingLevel: history.thinkingLevel,
        type: 'agent',
    }).filter(([, fieldValue]) => fieldValue !== undefined));

    return { ...base, details, rootConversationId: candidates[0].id };
}

function migrateVersionThreeRecord(record, index) {
    if (record.type === 'system' || record.details?.type !== 'agent') return record;
    const { accessLevel, approvalPolicy, ...details } = record.details;
    const permissionMode = legacyPermissionMode(details.agent, accessLevel, approvalPolicy, `records[${index}].details`);

    return {
        ...record,
        details: { ...details, ...(permissionMode !== undefined ? { permissionMode } : {}) },
    };
}

export function migrateActivityValue(value, expectedOrigin = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: root must be an object');
    if (![LEGACY_ACTIVITY_VERSION, SECOND_ACTIVITY_VERSION, THIRD_ACTIVITY_VERSION, PREVIOUS_ACTIVITY_VERSION].includes(value.version)) {
        throw new Error(`Cannot migrate activity file version ${String(value.version)}`);
    }
    if ([SECOND_ACTIVITY_VERSION, THIRD_ACTIVITY_VERSION, PREVIOUS_ACTIVITY_VERSION].includes(value.version)) {
        const flatActionSettings = value.version === THIRD_ACTIVITY_VERSION
            ? migrateVersionThreeActionSettings(value.actionSettings)
            : value.version === PREVIOUS_ACTIVITY_VERSION
                ? value.actionSettings
                : {};
        const actionSettings = migrateVersionFourActionSettings(flatActionSettings);
        const records = value.records.map(migrateVersionThreeRecord);

        return parseActivityValue({ ...value, actionSettings, records, version: ACTIVITY_VERSION }, expectedOrigin);
    }
    if (!Array.isArray(value.records)) throw new Error('Malformed activity file: records must be an array');
    if (!Array.isArray(value.conversations)) throw new Error('Malformed activity file: conversations must be an array');
    const origin = parseOrigin(value.origin);
    if (expectedOrigin && !sameOrigin(origin, parseOrigin(expectedOrigin))) {
        throw new Error('Malformed activity file: origin does not match requested activity');
    }
    const conversations = value.conversations.map((conversation, index) => parseConversation(conversation, index, origin));
    const legacyRecords = value.records.map((record, index) => parseLegacyRecord(record, index, origin));
    const migrated = {
        actionSettings: {},
        conversations,
        origin,
        records: legacyRecords.map((record, index) => migrateLegacyRecord(record, index, conversations)),
        version: ACTIVITY_VERSION,
    };

    return parseActivityValue(migrated, expectedOrigin);
}

function repairActionSettings(value, version) {
    if (version === LEGACY_ACTIVITY_VERSION || version === SECOND_ACTIVITY_VERSION) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).flatMap(([actionId, settings]) => {
        try {
            const flatSettings = version === THIRD_ACTIVITY_VERSION
                ? migrateVersionThreeActionSettings({ [actionId]: settings })
                : { [actionId]: settings };
            const parsed = version === THIRD_ACTIVITY_VERSION || version === PREVIOUS_ACTIVITY_VERSION
                ? migrateVersionFourActionSettings(flatSettings)
                : parseActionSettings(flatSettings);

            return [[actionId, parsed[actionId]]];
        } catch {
            return [];
        }
    }));
}

function repairRecordCollections(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const commits = Array.isArray(value.commits) ? value.commits.flatMap((commit, index) => {
        try {
            return [parseCommit(commit, index)];
        } catch {
            return [];
        }
    }) : [];
    const conversationIds = Array.isArray(value.conversationIds)
        ? value.conversationIds.filter((conversationId) => typeof conversationId === 'string' && conversationId.length > 0)
        : [];

    return { ...value, commits, conversationIds };
}

function repairRecord(value, index, version, origin, conversations) {
    const normalizedValue = repairRecordCollections(value);
    try {
        if (version === LEGACY_ACTIVITY_VERSION) {
            const legacyRecord = parseLegacyRecord(normalizedValue, index, origin);
            const migratedRecord = migrateLegacyRecord(legacyRecord, index, conversations);

            return parseRecord(migratedRecord, index, origin);
        }
        const migratedRecord = version === SECOND_ACTIVITY_VERSION || version === THIRD_ACTIVITY_VERSION
            ? migrateVersionThreeRecord(normalizedValue, index)
            : normalizedValue;

        return parseRecord(migratedRecord, index, origin);
    } catch {
        return null;
    }
}

function hasValidRecordConversationLinks(record, conversations) {
    if (record.type === 'system' || record.details.type !== 'agent') return true;
    if (!record.conversationIds.includes(record.rootConversationId)) return false;
    const conversation = conversations.find(({ id }) => id === record.rootConversationId);

    return !!conversation && conversation.actionId === record.rootActionId;
}

function repairKnownActivityValue(value, expectedOrigin) {
    const origin = expectedOrigin ? parseOrigin(expectedOrigin) : parseOrigin(value.origin);
    const actionSettings = repairActionSettings(value.actionSettings, value.version);
    const rawConversations = Array.isArray(value.conversations) ? value.conversations : [];
    const conversations = rawConversations
        .map((conversation, index) => repairConversation(conversation, index, origin))
        .filter((conversation) => conversation !== null);
    const rawRecords = Array.isArray(value.records) ? value.records : [];
    const records = rawRecords
        .map((record, index) => repairRecord(record, index, value.version, origin, conversations))
        .filter((record) => record !== null)
        .filter((record) => hasValidRecordConversationLinks(record, conversations));

    return parseActivityValue({ actionSettings, conversations, origin, records, version: ACTIVITY_VERSION }, origin);
}

/** Salvage one activity file without weakening strict parsing used by normal reads and writes. */
export function repairActivityFile(content, expectedOrigin = null) {
    let value;
    try {
        value = JSON.parse(content);
    } catch {
        if (!expectedOrigin) return { activity: null, changed: false, status: 'unrecoverable' };

        return { activity: createActivityFile(expectedOrigin), changed: true, status: 'repaired' };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        if (!expectedOrigin) return { activity: null, changed: false, status: 'unrecoverable' };

        return { activity: createActivityFile(expectedOrigin), changed: true, status: 'repaired' };
    }
    if (typeof value.version === 'number' && value.version > ACTIVITY_VERSION) {
        return { activity: null, changed: false, status: 'future' };
    }
    if (![LEGACY_ACTIVITY_VERSION, SECOND_ACTIVITY_VERSION, THIRD_ACTIVITY_VERSION, PREVIOUS_ACTIVITY_VERSION, ACTIVITY_VERSION].includes(value.version)) {
        return { activity: null, changed: false, status: 'unrecoverable' };
    }
    if (value.version === ACTIVITY_VERSION) {
        try {
            const activity = parseActivityValue(value, expectedOrigin);

            return { activity, changed: false, status: 'valid' };
        } catch {
            // Continue through tolerant normalization.
        }
    }
    try {
        const activity = repairKnownActivityValue(value, expectedOrigin);

        return { activity, changed: true, status: 'repaired' };
    } catch {
        return { activity: null, changed: false, status: 'unrecoverable' };
    }
}

function sameJsonValue(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;

        return left.every((value, index) => sameJsonValue(value, right[index]));
    }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key], right[key]));
}

/** Canonicalize one valid activity file while preserving repair reporting for invalid input. */
export function compactActivityFileContent(content, expectedOrigin = null) {
    const result = repairActivityFile(content, expectedOrigin);
    if (result.status !== 'valid') return result;
    const source = JSON.parse(content);

    return { ...result, changed: !sameJsonValue(source, result.activity) };
}

export function parseActivityFile(content, expectedOrigin = null) {
    return parseActivityValueForMigration(JSON.parse(content), expectedOrigin);
}

/** Parses current activity or strictly migrates a recognized legacy version in memory. */
export function parseActivityValueForMigration(value, expectedOrigin = null) {
    if ([LEGACY_ACTIVITY_VERSION, SECOND_ACTIVITY_VERSION, THIRD_ACTIVITY_VERSION, PREVIOUS_ACTIVITY_VERSION].includes(value?.version)) {
        return migrateActivityValue(value, expectedOrigin);
    }

    return parseActivityValue(value, expectedOrigin);
}

export function parseActivityFileForMigration(content, expectedOrigin = null) {
    return parseActivityValueForMigration(JSON.parse(content), expectedOrigin);
}

export function findActivityConversation(activity, conversationId) {
    const conversation = activity.conversations.find(({ id }) => id === conversationId);
    if (!conversation) throw new Error(`Activity conversation not found: ${conversationId}`);
    return conversation;
}
