import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConversation, AgentConversationMessage } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionConversationChat } from './action_conversation_chat'

let clientHeight = 100
let scrollHeight = 300
let scrollPositions = new WeakMap<HTMLElement, number>()
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop')

function message(id: string, content: string): AgentConversationMessage {
    return { content, id, role: 'assistant', timestamp: '2026-07-27T10:00:00.000Z' }
}

function conversation(path: string, messages: AgentConversationMessage[]): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-83.md',
        completedAt: '2026-07-27T10:01:00.000Z',
        events: [],
        hasExplicitTitle: true,
        id: path,
        messages,
        path,
        providerSessions: [],
        startedAt: '2026-07-27T10:00:00.000Z',
        status: 'completed',
        title: path,
    }
}

function renderChat(value: AgentConversation | null) {
    return render(
        <AppThemeProvider>
            <ActionConversationChat conversation={value} status="idle" />
        </AppThemeProvider>,
    )
}

function restoreProperty(name: 'clientHeight' | 'scrollHeight' | 'scrollTop', descriptor?: PropertyDescriptor) {
    if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
        return
    }

    delete HTMLElement.prototype[name]
}

describe('ActionConversationChat', () => {
    beforeEach(() => {
        clientHeight = 100
        scrollHeight = 300
        scrollPositions = new WeakMap<HTMLElement, number>()
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight })
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            get() {
                return scrollPositions.get(this) ?? 0
            },
            set(value: number) {
                const maximumScrollTop = Math.max(0, scrollHeight - clientHeight)
                scrollPositions.set(this, Math.max(0, Math.min(value, maximumScrollTop)))
            },
        })
    })

    afterEach(() => {
        cleanup()
        restoreProperty('clientHeight', originalClientHeight)
        restoreProperty('scrollHeight', originalScrollHeight)
        restoreProperty('scrollTop', originalScrollTop)
    })

    it('starts at the end when a conversation loads', () => {
        renderChat(conversation('first.json', [message('message-1', 'First')]))

        expect(screen.getByLabelText('Conversation chat').scrollTop).toBe(200)
    })

    it('returns to the end when the selected conversation changes', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const second = conversation('second.json', [message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={second} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(200)
    })

    it('keeps new content visible while stuck to the end', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(300)
    })

    it('does not move when new content arrives after the user scrolls up', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(40)
    })

    it('restores sticky behavior after the user returns within the end tolerance', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 196
        fireEvent.scroll(viewport)
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(300)
    })

    it('keeps empty content at the end when it is shorter than the viewport', () => {
        clientHeight = 200
        scrollHeight = 80
        const { rerender } = renderChat(null)
        const viewport = screen.getByLabelText('Conversation chat')
        fireEvent.scroll(viewport)
        scrollHeight = 100

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation('empty.json', [])} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(0)
    })

    it('keeps vertical scrolling on the chat viewport and wraps long message tokens', () => {
        const path = 'C:\\Users\\janbo\\Documents\\dev\\md2\\design/feature_descriptions/F_69_config_in_dialog.md'
        renderChat(conversation('first.json', [message('message-1', path)]))

        const viewport = screen.getByLabelText('Conversation chat')
        const messageBox = screen.getByText(path).parentElement?.parentElement

        expect(viewport).toHaveStyle({ overflowX: 'hidden', overflowY: 'auto' })
        expect(messageBox).toHaveStyle({ flexShrink: '0', minWidth: '0', overflowWrap: 'anywhere' })
        expect(messageBox).not.toHaveStyle({ overflowX: 'auto' })
    })
})
