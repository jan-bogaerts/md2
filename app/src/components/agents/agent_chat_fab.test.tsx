import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configService } from '../../services/config_service'
import { AgentChatFab } from './agent_chat_fab'

describe('AgentChatFab', () => {
    beforeEach(() => {
        configService.init()
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
    })

    it('opens and closes project-wide run form on plain clicks', () => {
        render(<AgentChatFab />)
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.click(button)

        expect(screen.getByRole('dialog', { name: 'Run actions' })).toBeInTheDocument()
        expect(screen.getByLabelText('Extra prompt')).toBeInTheDocument()

        fireEvent.click(button)

        expect(screen.queryByRole('dialog', { name: 'Run actions' })).not.toBeInTheDocument()
    })

    it('moves without opening popup when pointer gesture crosses drag threshold', () => {
        render(<AgentChatFab />)
        const button = screen.getByRole('button', { name: 'Project agent' })

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 })
        fireEvent.pointerMove(button, { clientX: 900, clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(button, { pointerId: 1 })
        fireEvent.click(button)

        expect(button).toHaveStyle({ left: '888px', top: '488px' })
        expect(screen.queryByRole('dialog', { name: 'Run actions' })).not.toBeInTheDocument()

        fireEvent.click(button)
        expect(screen.getByRole('dialog', { name: 'Run actions' })).toBeInTheDocument()
    })
})
