import { describe, expect, it } from 'vitest'
import type { ActionRunLogEntry } from '../../../data/action_run_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import { createErrorLogsSelector } from './action_log_error_selector'

function log(status: ActionRunLogEntry['status']): ActionRunLogEntry {
    return { status } as ActionRunLogEntry
}

function run(logs: ActionRunLogEntry[]) {
    return { logs } as ActionRun
}

describe('createErrorLogsSelector', () => {
    it('retains failed-log result while unrelated running output changes', () => {
        const failedLog = log('failed')
        const selectErrorLogs = createErrorLogsSelector()
        const first = selectErrorLogs(run([failedLog, log('running')]))
        const second = selectErrorLogs(run([failedLog, log('running')]))

        expect(second).toBe(first)
        expect(second).toEqual([failedLog])
    })

    it('returns a new result when a failed log changes', () => {
        const selectErrorLogs = createErrorLogsSelector()
        const first = selectErrorLogs(run([log('failed')]))
        const second = selectErrorLogs(run([log('failed')]))

        expect(second).not.toBe(first)
    })
})
