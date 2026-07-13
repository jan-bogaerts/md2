import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActions } from './use_actions'
import { ActionService } from '../../services/action_service'
import { CUSTOM_PROMPT_ACTION_NAME, type ActionFile } from '../../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

describe('useActions', () => {
    it('returns the current actions and updates when they load', () => {
        const service = new ActionService()
        const { result } = renderHook(() => useActions(service))

        expect(result.current.actions.map((action) => action.name)).toEqual([CUSTOM_PROMPT_ACTION_NAME])

        act(() => {
            service.loadFromFiles([file({ command: 'run', description: 'Do', id: 'do', label: 'Do', name: 'do', type: 'command' })])
        })

        expect(result.current.actions.map((action) => action.name)).toContain('do')
    })
})
