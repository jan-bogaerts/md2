export const ACTION_SCHEDULES_FILE = '.md2-schedules.json';

const SCHEDULE_STATUSES = new Set(['cancelled', 'completed', 'failed', 'pending', 'running']);
const ACTION_CONTEXT_KINDS = new Set(['card', 'diagram', 'file', 'folder', 'merge-conflict', 'project']);

function requireObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid schedule file: ${fieldName} must be an object`);
    }

    return value;
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid schedule file: missing ${fieldName}`);

    return value;
}

function requireTimestamp(value, fieldName) {
    const timestamp = requireString(value, fieldName);
    if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Invalid schedule file: invalid ${fieldName}`);

    return timestamp;
}

function parseContext(value) {
    const context = requireObject(value, 'context');
    const kind = requireString(context.kind, 'context.kind');
    if (!ACTION_CONTEXT_KINDS.has(kind)) throw new Error(`Invalid schedule file: unsupported context kind ${kind}`);
    const parsedContext = { kind };

    for (const [key, contextValue] of Object.entries(context)) {
        if (key === 'kind') continue;
        if (typeof contextValue !== 'string') throw new Error(`Invalid schedule file: context.${key} must be a string`);
        parsedContext[key] = contextValue;
    }

    return parsedContext;
}

function parseTrigger(value) {
    const trigger = requireObject(value, 'trigger');
    const type = requireString(trigger.type, 'trigger.type');

    if (type === 'now') return { type };
    if (type === 'at') return { timestamp: requireTimestamp(trigger.timestamp, 'trigger.timestamp'), type };
    if (type === 'account-reset') {
        return {
            agent: requireString(trigger.agent, 'trigger.agent'),
            expectedResetAt: requireTimestamp(trigger.expectedResetAt, 'trigger.expectedResetAt'),
            limitId: requireString(trigger.limitId, 'trigger.limitId'),
            type,
            windowId: requireString(trigger.windowId, 'trigger.windowId'),
        };
    }
    if (type === 'card-state') {
        return {
            cardInternalId: requireString(trigger.cardInternalId, 'trigger.cardInternalId'),
            registrationState: requireString(trigger.registrationState, 'trigger.registrationState'),
            targetState: requireString(trigger.targetState, 'trigger.targetState'),
            type,
        };
    }

    throw new Error(`Invalid schedule file: unsupported trigger type ${type}`);
}

function parseStatus(value) {
    const status = requireString(value, 'status');
    if (!SCHEDULE_STATUSES.has(status)) throw new Error(`Invalid schedule file: unsupported status ${status}`);

    return status;
}

function parseBaseSchedule(value) {
    const schedule = requireObject(value, 'schedule');
    const kind = requireString(schedule.kind, 'kind');
    if (kind !== 'action' && kind !== 'sequence') throw new Error(`Invalid schedule file: unsupported kind ${kind}`);

    return {
        createdAt: requireTimestamp(schedule.createdAt, 'createdAt'),
        id: requireString(schedule.id, 'id'),
        kind,
        status: parseStatus(schedule.status),
        trigger: parseTrigger(schedule.trigger),
    };
}

function parseActionSchedule(schedule, base) {
    if (base.trigger.type === 'now') throw new Error('Invalid schedule file: now trigger requires sequence kind');
    const context = parseContext(schedule.context);
    if (base.trigger.type === 'card-state' && context.cardInternalId === base.trigger.cardInternalId) {
        throw new Error('Invalid schedule file: scheduled action card and trigger card must differ');
    }

    return { actionId: requireString(schedule.actionId, 'actionId'), context, ...base };
}

function parseCardInternalIds(value) {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Invalid schedule file: cardInternalIds must be a non-empty array');
    const cardInternalIds = value.map((cardInternalId, index) => requireString(cardInternalId, `cardInternalIds[${index}]`));
    if (new Set(cardInternalIds).size !== cardInternalIds.length) {
        throw new Error('Invalid schedule file: duplicate sequence cardInternalId');
    }

    return cardInternalIds;
}

function parseSequenceSchedule(schedule, base) {
    return { cardInternalIds: parseCardInternalIds(schedule.cardInternalIds), ...base };
}

function parseSchedule(value) {
    const schedule = requireObject(value, 'schedule');
    const base = parseBaseSchedule(schedule);

    return base.kind === 'action'
        ? parseActionSchedule(schedule, base)
        : parseSequenceSchedule(schedule, base);
}

/** Parse and validate persisted schedule JSON. */
export function parseScheduleFile(value) {
    const file = requireObject(value, 'root');
    if (!Array.isArray(file.schedules)) throw new Error('Invalid schedule file: schedules must be an array');

    return { schedules: file.schedules.map(parseSchedule) };
}

/** Build persisted schedule JSON after validating every record. */
export function createScheduleFile(schedules) {
    return parseScheduleFile({ schedules });
}
