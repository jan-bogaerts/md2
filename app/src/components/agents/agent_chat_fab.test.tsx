import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../../services/config/config_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { AgentChatFab } from './agent_chat_fab'

describe('AgentChatFab', () => {
    beforeEach(() => {
        configService.init()
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    })

    afterEach(() => {
        cleanup()
        delete window.md2Actions
        configService.clear()
    })

    it('opens and closes project-wide run form on plain clicks', async () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.click(button)

        expect(screen.getByRole('dialog', { name: 'Run actions for Project' })).toBeInTheDocument()
        expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Conversation history' })).toBeInTheDocument()
        expect(screen.getByLabelText('Conversation chat').compareDocumentPosition(screen.getByLabelText('Prompt')))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(document.querySelector('.MuiModal-root')).not.toBeInTheDocument()

        fireEvent.click(button)

        expect(screen.queryByRole('dialog', { name: 'Run actions for Project' })).not.toBeInTheDocument()
    })

    it('moves without opening popup when pointer gesture crosses drag threshold', () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 })
        fireEvent.pointerMove(button, { clientX: 900, clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(button, { pointerId: 1 })
        fireEvent.click(button)

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '888px', top: '488px' })
        expect(screen.queryByRole('dialog', { name: 'Run actions for Project' })).not.toBeInTheDocument()

        fireEvent.click(button)
        expect(screen.getByRole('dialog', { name: 'Run actions for Project' })).toBeInTheDocument()
    })

    it('detaches the draggable popup while keeping its far corner fixed when resized from the top-left', () => {
        render(<AgentChatFab />, { wrapper: AppThemeProvider })
        const button = screen.getByRole('button', { name: 'Project agent' })
        fireEvent.click(button)
        const dialog = screen.getByRole('dialog', { name: 'Run actions for Project' })
        const handle = screen.getByRole('separator', { name: 'Resize action popup from top-left' })
        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(700, 200, 400, 450))

        fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '1128px', top: '728px' })
        expect(dialog.style.width).toBe('450px')
        expect(dialog.style.height).toBe('510px')
        expect(dialog).toHaveStyle({ left: '650px', position: 'fixed', top: '140px' })
    })
})
