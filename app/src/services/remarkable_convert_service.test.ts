import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { ActionRunResult } from '../data/action_run_types'
import { convertRemarkableImagesToText } from './remarkable_convert_service'

type RunFn = (action: ActionDefinition, context: ActionContext) => Promise<ActionRunResult>

describe('convertRemarkableImagesToText', () => {
    it('throws when no agent is available so the action can stay hidden', async () => {
        const run = vi.fn()
        await expect(convertRemarkableImagesToText(
            { cardPath: 'design/F-1-card.md', imagePaths: ['design/note.png'] },
            { isAgentAvailable: () => false, run },
        )).rejects.toThrow(/requires an available agent/u)

        expect(run).not.toHaveBeenCalled()
    })

    it('throws when there are no images to convert', async () => {
        await expect(convertRemarkableImagesToText(
            { cardPath: 'design/F-1-card.md', imagePaths: [] },
            { isAgentAvailable: () => true, run: vi.fn() },
        )).rejects.toThrow(/No imported images/u)
    })

    it('passes the image paths to the agent and binds the run to the card', async () => {
        const run = vi.fn<RunFn>(async () => ({ logs: [], status: 'completed' }))
        await convertRemarkableImagesToText(
            { cardPath: 'design/F-1-card.md', cardType: 'feature', imagePaths: ['design/a.png', 'design/b.png'] },
            { isAgentAvailable: () => true, run },
        )

        const [action, context] = run.mock.calls[0]
        expect(action.type).toBe('agent')
        expect(action.prompt).toContain('design/a.png')
        expect(action.prompt).toContain('design/b.png')
        expect(action.prompt).toContain('{{file}}')
        expect(context).toEqual({ file: 'design/F-1-card.md', kind: 'card', type: 'feature' })
    })
})
