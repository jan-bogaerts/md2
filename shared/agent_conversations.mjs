import { normalizeAgentTokenUsage } from './agent_usage_math.mjs';

const AGENT_MESSAGE_ROLES = new Set(['assistant', 'user']);
const AGENT_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running', 'waitingForInput']);
const INTERNAL_EVENT_TYPES = new Set(['closed', 'started', 'turnCompleted']);
export const AGENT_RESULT_MAX_LENGTH = 8_192;
export const AGENT_CONVERSATION_USAGE_SCHEMA_VERSION = 1;

function safePrefix(value, length) {
    if (length <= 0) return '';
    const end = length < value.length
        && /[\uD800-\uDBFF]/u.test(value[length - 1])
        && /[\uDC00-\uDFFF]/u.test(value[length])
        ? length - 1
        : length;

    return value.slice(0, end);
}

function safeSuffix(value, length) {
    if (length <= 0) return '';
    const candidateStart = Math.max(0, value.length - length);
    const start = candidateStart > 0
        && /[\uDC00-\uDFFF]/u.test(value[candidateStart])
        && /[\uD800-\uDBFF]/u.test(value[candidateStart - 1])
        ? candidateStart + 1
        : candidateStart;

    return value.slice(start);
}

function omittedCharacterMarker(omittedCharacters) {
    return `\n[${omittedCharacters} characters omitted]\n`;
}

function boundedAgentResultParts(headSource, tailSource, totalLength) {
    let marker = omittedCharacterMarker(totalLength);
    while (true) {
        const retainedLength = AGENT_RESULT_MAX_LENGTH - marker.length;
        const head = safePrefix(headSource, Math.ceil(retainedLength / 2));
        const tail = safeSuffix(tailSource, Math.floor(retainedLength / 2));
        const nextMarker = omittedCharacterMarker(totalLength - head.length - tail.length);
        if (nextMarker === marker) return `${head}${marker}${tail}`;
        marker = nextMarker;
    }
}

/** Bound one command or tool result while retaining useful beginning and ending context. */
export function boundedAgentResult(value) {
    if (value.length <= AGENT_RESULT_MAX_LENGTH) return value;

    return boundedAgentResultParts(value, value, value.length);
}

/** Append a streamed result without retaining its omitted middle in memory. */
export function appendBoundedAgentResult(state, chunk) {
    const current = state ?? { head: '', tail: '', totalLength: 0 };
    const head = current.head.length === AGENT_RESULT_MAX_LENGTH
        ? current.head
        : safePrefix(`${current.head}${chunk}`, AGENT_RESULT_MAX_LENGTH);
    const tail = safeSuffix(`${current.tail}${chunk}`, AGENT_RESULT_MAX_LENGTH);
    const totalLength = current.totalLength + chunk.length;
    const value = totalLength <= AGENT_RESULT_MAX_LENGTH
        ? head
        : boundedAgentResultParts(head, tail, totalLength);

    return { state: { head, tail, totalLength }, value };
}

function requiredString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent conversation: missing ${fieldName}`);

    return value;
}

function optionalString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalInteger(value) {
    return Number.isSafeInteger(value) ? value : null;
}

function optionalNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : null;
}

function normalizeQuestionOption(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const label = optionalString(value.label);
    if (!label) return null;
    const description = optionalString(value.description);

    return { ...(description ? { description } : {}), label };
}

function normalizeQuestion(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const header = optionalString(value.header);
    const id = optionalString(value.id);
    const question = optionalString(value.question);
    if (!header || !id || !question) return null;
    const options = Array.isArray(value.options)
        ? value.options.map(normalizeQuestionOption).filter((option) => option !== null)
        : null;

    return {
        header,
        id,
        ...(typeof value.isSecret === 'boolean' ? { isSecret: value.isSecret } : {}),
        ...(options ? { options } : {}),
        question,
    };
}

/** Structured questions of an `agentQuestion` entry, so a pending question survives a restart. */
function optionalQuestions(value) {
    if (!Array.isArray(value)) return null;
    const questions = value.map(normalizeQuestion).filter((question) => question !== null);

    return questions.length > 0 ? questions : null;
}

function normalizeMessage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!AGENT_MESSAGE_ROLES.has(value.role)) return null;
    if (typeof value.content !== 'string') return null;
    const id = optionalString(value.id);
    const timestamp = optionalString(value.timestamp);
    if (!id || !timestamp) return null;
    const agent = optionalString(value.agent);
    const sequence = optionalInteger(value.sequence);

    return {
        ...(agent ? { agent } : {}),
        content: value.content,
        id,
        kind: 'message',
        role: value.role,
        ...(sequence !== null ? { sequence } : {}),
        timestamp,
    };
}

function normalizeEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.content !== 'string') return null;
    const id = optionalString(value.id);
    const timestamp = optionalString(value.timestamp);
    const type = optionalString(value.type);
    if (!id || !timestamp || !type) return null;
    const command = optionalString(value.command);
    const content = value.type === 'commandExecution' || value.type === 'tool.result'
        ? boundedAgentResult(value.content)
        : value.content;
    const deletions = optionalNonNegativeInteger(value.deletions);
    const details = optionalStringArray(value.details);
    const durationMs = optionalNumber(value.durationMs);
    const exitCode = optionalInteger(value.exitCode);
    const insertions = optionalNonNegativeInteger(value.insertions);
    const label = optionalString(value.label);
    const output = value.type !== 'commandExecution' && typeof value.output === 'string'
        ? boundedAgentResult(value.output)
        : null;
    const parentItemId = optionalString(value.parentItemId);
    const providerItemId = optionalString(value.providerItemId);
    const questions = optionalQuestions(value.questions);
    const runningSubThreads = optionalNonNegativeInteger(value.runningSubThreads);
    const sequence = optionalInteger(value.sequence);
    const status = optionalString(value.status);
    const summary = optionalStringArray(value.summary);
    const workingDirectory = optionalString(value.workingDirectory);

    return {
        ...(command ? { command } : {}),
        content,
        ...(deletions !== null ? { deletions } : {}),
        ...(details ? { details } : {}),
        ...(durationMs !== null ? { durationMs } : {}),
        ...(exitCode !== null ? { exitCode } : {}),
        id,
        ...(insertions !== null ? { insertions } : {}),
        kind: 'event',
        ...(label ? { label } : {}),
        ...(output !== null ? { output } : {}),
        ...(parentItemId ? { parentItemId } : {}),
        ...(providerItemId ? { providerItemId } : {}),
        ...(questions ? { questions } : {}),
        ...(runningSubThreads !== null ? { runningSubThreads } : {}),
        ...(sequence !== null ? { sequence } : {}),
        ...(status ? { status } : {}),
        ...(summary ? { summary } : {}),
        timestamp,
        type,
        ...(workingDirectory ? { workingDirectory } : {}),
    };
}

function normalizeProviderSession(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const agent = optionalString(value.agent);
    const conversationId = optionalString(value.conversationId);
    const createdAt = optionalString(value.createdAt);
    const lastUsedAt = optionalString(value.lastUsedAt);
    const synchronizedThroughMessageId = optionalString(value.synchronizedThroughMessageId);
    if (!agent || !conversationId || !createdAt || !lastUsedAt || !synchronizedThroughMessageId) return null;

    return { agent, conversationId, createdAt, lastUsedAt, synchronizedThroughMessageId };
}

function normalizeContextWindowUsage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { capacityTokens, usedTokens } = value;
    if (!Number.isSafeInteger(usedTokens) || usedTokens < 0) return null;
    if (!Number.isSafeInteger(capacityTokens) || capacityTokens <= 0) return null;

    return { capacityTokens, usedTokens };
}

function normalizeTimer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed agent conversation: invalid timer');
    }
    const { elapsedMs, runningStartedAt } = value;
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
        throw new Error('Malformed agent conversation: invalid timer.elapsedMs');
    }
    if (runningStartedAt !== null
        && (typeof runningStartedAt !== 'string' || Number.isNaN(Date.parse(runningStartedAt)))) {
        throw new Error('Malformed agent conversation: invalid timer.runningStartedAt');
    }

    return { elapsedMs, runningStartedAt };
}

function normalizeArray(value, normalize) {
    if (!Array.isArray(value)) return [];

    return value.map(normalize).filter((entry) => entry !== null);
}

function coalesceDiagnosticEntries(entries) {
    const groupedEntries = [];
    for (const entry of entries) {
        const previousEntry = groupedEntries.at(-1);
        if (entry.kind === 'event' && entry.type === 'diagnostic'
            && previousEntry?.kind === 'event' && previousEntry.type === 'diagnostic') {
            groupedEntries[groupedEntries.length - 1] = {
                ...previousEntry,
                content: `${previousEntry.content}\n${entry.content}`,
            };
            continue;
        }
        groupedEntries.push(entry);
    }

    return groupedEntries;
}

function isConversationEntry(entry) {
    if (entry.kind !== 'event') return true;
    if (INTERNAL_EVENT_TYPES.has(entry.type)) return false;

    return entry.type !== 'error' || typeof entry.providerItemId === 'string';
}

function normalizeEntries(value) {
    if (!Array.isArray(value)) throw new Error('Malformed agent conversation: missing entries');

    const entries = value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Malformed agent conversation: invalid entries[${index}]`);
        }
        const normalized = entry.kind === 'message'
            ? normalizeMessage(entry)
            : entry.kind === 'event'
                ? normalizeEvent(entry)
                : null;
        if (!normalized) throw new Error(`Malformed agent conversation: invalid entries[${index}]`);

        return normalized;
    });

    return coalesceDiagnosticEntries(entries.filter(isConversationEntry));
}

/** Parse one canonical conversation value and validate every ordered entry. */
export function parseAgentConversationValue(parsed, referencePath) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed agent conversation: root must be an object');
    const id = requiredString(parsed.id, 'id');
    const status = requiredString(parsed.status, 'status');
    if (!AGENT_STATUSES.has(status)) throw new Error(`Malformed agent conversation: invalid status ${status}`);
    const startedAt = requiredString(parsed.startedAt, 'startedAt');
    const hasExplicitTitle = typeof parsed.title === 'string' && parsed.title.trim().length > 0;
    const contextWindowUsage = normalizeContextWindowUsage(parsed.contextWindowUsage);
    const usage = normalizeAgentTokenUsage(parsed.usage);
    if (parsed.usageSchemaVersion !== undefined
        && parsed.usageSchemaVersion !== AGENT_CONVERSATION_USAGE_SCHEMA_VERSION) {
        throw new Error(`Malformed agent conversation: unsupported usageSchemaVersion ${String(parsed.usageSchemaVersion)}`);
    }
    if (usage && parsed.usageSchemaVersion === undefined
        && typeof parsed.usage.totalTokens === 'number'
        && Number.isFinite(parsed.usage.totalTokens)
        && parsed.usage.totalTokens >= 0) {
        usage.totalTokens = parsed.usage.totalTokens;
    }
    if (usage && parsed.usageSchemaVersion === AGENT_CONVERSATION_USAGE_SCHEMA_VERSION
        && parsed.usage.totalTokens !== usage.totalTokens) {
        throw new Error('Malformed agent conversation: inconsistent usage.totalTokens');
    }
    const timer = parsed.timer === undefined ? null : normalizeTimer(parsed.timer);
    if (parsed.viewed !== undefined && typeof parsed.viewed !== 'boolean') {
        throw new Error('Malformed agent conversation: invalid viewed');
    }

    return {
        actionId: optionalString(parsed.actionId),
        cardInternalId: optionalString(parsed.cardInternalId),
        cardPath: optionalString(parsed.cardPath),
        completedAt: optionalString(parsed.completedAt),
        ...(contextWindowUsage ? { contextWindowUsage } : {}),
        entries: normalizeEntries(parsed.entries),
        hasExplicitTitle,
        id,
        path: referencePath,
        providerSessions: normalizeArray(parsed.providerSessions, normalizeProviderSession),
        startedAt,
        status,
        ...(timer ? { timer } : {}),
        title: hasExplicitTitle ? parsed.title : id,
        ...(usage ? { usage } : {}),
        ...(parsed.usageSchemaVersion !== undefined ? { usageSchemaVersion: parsed.usageSchemaVersion } : {}),
        viewed: parsed.viewed ?? true,
    };
}

/** Parse one canonical conversation record and validate every ordered entry. */
export function parseAgentConversation(content, referencePath) {
    return parseAgentConversationValue(JSON.parse(content), referencePath);
}
