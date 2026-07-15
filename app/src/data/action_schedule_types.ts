import type { ActionContext } from './action_context'

export const ACTION_SCHEDULES_FILE = '.md2-schedules.json'

export type ActionScheduleStatus = 'cancelled' | 'completed' | 'failed' | 'pending' | 'running'

export interface AtActionScheduleTrigger {
    timestamp: string
    type: 'at'
}

export interface AgentSlotActionScheduleTrigger {
    type: 'agentSlot'
}

export interface AfterActionScheduleTrigger {
    actionId: string
    type: 'afterAction'
}

export type ActionScheduleTrigger =
    | AfterActionScheduleTrigger
    | AgentSlotActionScheduleTrigger
    | AtActionScheduleTrigger

export interface ActionSchedule {
    actionId: string
    context: ActionContext
    createdAt: string
    id: string
    status: ActionScheduleStatus
    trigger: ActionScheduleTrigger
}

export interface ActionScheduleFile {
    schedules: ActionSchedule[]
}

const ACTION_SCHEDULE_STATUSES: ActionScheduleStatus[] = ['cancelled', 'completed', 'failed', 'pending', 'running']
const ACTION_CONTEXT_KINDS: ActionContext['kind'][] = ['card', 'file', 'folder', 'project']

function requireScheduleObject(value: unknown, fieldName: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid action schedule file: ${fieldName} must be an object`)
    }

    return value as Record<string, unknown>
}

function requireScheduleString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid action schedule file: missing ${fieldName}`)

    return value
}

function parseScheduleContext(value: unknown): ActionContext {
    const context = requireScheduleObject(value, 'context')
    const kind = requireScheduleString(context.kind, 'context.kind')
    const actionContextKind = ACTION_CONTEXT_KINDS.find((candidate) => candidate === kind)
    if (!actionContextKind) throw new Error(`Invalid action schedule file: unsupported context kind ${kind}`)

    const parsedContext: ActionContext = { kind: actionContextKind }

    for (const [key, contextValue] of Object.entries(context)) {
        if (key === 'kind') continue
        if (typeof contextValue !== 'string') throw new Error(`Invalid action schedule file: context.${key} must be a string`)

        parsedContext[key] = contextValue
    }

    return parsedContext
}

function parseScheduleTrigger(value: unknown): ActionScheduleTrigger {
    const trigger = requireScheduleObject(value, 'trigger')
    const type = requireScheduleString(trigger.type, 'trigger.type')

    if (type === 'at') return { timestamp: requireScheduleString(trigger.timestamp, 'trigger.timestamp'), type }
    if (type === 'agentSlot') return { type }
    if (type === 'afterAction') return { actionId: requireScheduleString(trigger.actionId, 'trigger.actionId'), type }

    throw new Error(`Invalid action schedule file: unsupported trigger type ${type}`)
}

function parseScheduleStatus(value: unknown): ActionScheduleStatus {
    const status = requireScheduleString(value, 'status')
    const actionScheduleStatus = ACTION_SCHEDULE_STATUSES.find((candidate) => candidate === status)
    if (!actionScheduleStatus) throw new Error(`Invalid action schedule file: unsupported status ${status}`)

    return actionScheduleStatus
}

function parseActionSchedule(value: unknown): ActionSchedule {
    const schedule = requireScheduleObject(value, 'schedule')

    return {
        actionId: requireScheduleString(schedule.actionId, 'actionId'),
        context: parseScheduleContext(schedule.context),
        createdAt: requireScheduleString(schedule.createdAt, 'createdAt'),
        id: requireScheduleString(schedule.id, 'id'),
        status: parseScheduleStatus(schedule.status),
        trigger: parseScheduleTrigger(schedule.trigger),
    }
}

/** Parse and validate persisted scheduled-action JSON. */
export function parseActionScheduleFile(value: unknown): ActionScheduleFile {
    const file = requireScheduleObject(value, 'root')
    if (!Array.isArray(file.schedules)) throw new Error('Invalid action schedule file: schedules must be an array')

    return { schedules: file.schedules.map((schedule) => parseActionSchedule(schedule)) }
}

/** Build the explicit persisted scheduled-action JSON shape after validating every schedule. */
export function createActionScheduleFile(schedules: ActionSchedule[]): ActionScheduleFile {
    return parseActionScheduleFile({ schedules })
}
