import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { ActionPromptDraft } from './action_prompt_draft'
import type { ActionPopupController } from './use_action_popup_controller'

afterEach(cleanup)

function controller(): ActionPopupController {
    return {
        agentActive: false,
        backendAvailable: true,
        conversations: [],
        executionDisabledMessage: null,
        handleCancel: vi.fn(),
        handleConvertToAction: vi.fn(async () => true),
        handleFinish: vi.fn(),
        handleRun: vi.fn(),
        handleSaveAndRun: vi.fn(),
        handleToggleSchedule: vi.fn(),
        history: [],
        interactionReady: false,
        manualFinishAvailable: false,
        promptPreparationFailed: false,
        promptPreparationPending: false,
        runStatus: 'idle',
        saveDisabled: false,
        structuredQuestion: null,
    } as unknown as ActionPopupController
}

describe('ActionPopupBottomRow', () => {
    it('enables Send from the first live prompt change without rerendering unrelated content', () => {
        const promptDraft = new ActionPromptDraft('')
        const popupController = controller()
        const unrelatedRender = vi.fn()
        const action = { id: CUSTOM_PROMPT_ACTION_ID, type: 'agent' } as ActionDefinition

        function UnrelatedContent() {
            unrelatedRender()

            return <div>Conversation</div>
        }

        render(
            <AppThemeProvider>
                <UnrelatedContent />
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={{ kind: 'project' }}
                    baseContext={{ kind: 'project' }}
                    controller={popupController}
                    promptDraft={promptDraft}
                    showSaveControls={false}
                />
            </AppThemeProvider>,
        )
        const send = screen.getByRole('button', { name: 'Send' })
        expect(send).toBeDisabled()

        act(() => promptDraft.set('P'))

        expect(send).toBeEnabled()
        expect(unrelatedRender).toHaveBeenCalledTimes(1)

        fireEvent.click(send)

        expect(popupController.handleRun).toHaveBeenCalledWith('P')
    })

    it('disables Send when the live prompt is cleared', () => {
        const promptDraft = new ActionPromptDraft('Plan')
        const action = { id: CUSTOM_PROMPT_ACTION_ID, type: 'agent' } as ActionDefinition
        render(
            <AppThemeProvider>
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={{ kind: 'project' }}
                    baseContext={{ kind: 'project' }}
                    controller={controller()}
                    promptDraft={promptDraft}
                    showSaveControls={false}
                />
            </AppThemeProvider>,
        )
        const send = screen.getByRole('button', { name: 'Send' })
        expect(send).toBeEnabled()

        act(() => promptDraft.set(''))

        expect(send).toBeDisabled()
    })
})
