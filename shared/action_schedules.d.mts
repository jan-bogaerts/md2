import type { ActionContext } from '../app/src/data/action_context'

export const ACTION_SCHEDULES_FILE: '.md2-schedules.json'

export type ScheduleStatus = 'cancelled' | 'completed' | 'failed' | 'pending' | 'running'

export interface NowScheduleTrigger {
    type: 'now'
}

export interface AtScheduleTrigger {
    timestamp: string
    type: 'at'
}

export interface AccountResetScheduleTrigger {
    agent: string
    expectedResetAt: string
    limitId: string
    type: 'account-reset'
    windowId: string
}

export interface CardStateScheduleTrigger {
    cardInternalId: string
    registrationState: string
    targetState: string
    type: 'card-state'
}

export type ScheduleTrigger = NowScheduleTrigger | AtScheduleTrigger | AccountResetScheduleTrigger | CardStateScheduleTrigger
export type ActionScheduleTrigger = Exclude<ScheduleTrigger, NowScheduleTrigger>

interface ScheduleBase {
    createdAt: string
    id: string
    status: ScheduleStatus
    trigger: ScheduleTrigger
}

export interface ActionSchedule extends ScheduleBase {
    actionId: string
    context: ActionContext
    kind: 'action'
    trigger: ActionScheduleTrigger
}

export interface SequenceSchedule extends ScheduleBase {
    actionCompleted: boolean
    actionId: string
    cardInternalIds: string[]
    currentIndex: number
    currentRunId: string | null
    failure: string | null
    kind: 'sequence'
    readyState: string
    readyStateMet: boolean
}

export type Schedule = ActionSchedule | SequenceSchedule

export interface ScheduleFile {
    schedules: Schedule[]
}

export function parseScheduleFile(value: unknown): ScheduleFile
export function createScheduleFile(schedules: Schedule[]): ScheduleFile
