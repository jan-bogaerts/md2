import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationMessageEntry } from '../../../data/data_types'
import { dialogService } from '../../../services/dialog_service'
import { projectAccessService } from '../../../services/project/project_access_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import type { ActionConversationCommandOperations } from './action_conversation_command_service'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessageCommands } from './action_conversation_message_commands'
import { TerminalToolCallGroup } from './terminal_tool_call_group'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'

const firstMessage: AgentConversationMessageEntry = {
    content: '# Exact\n\nfirst prompt',
    id: 'message-1',
    kind: 'message',
    role: 'user',
    timestamp: '2026-09-12T10:00:00.000Z',
}
const assistantMessage: AgentConversationMessageEntry = {
    content: '**Exact response**',
    id: 'message-2',
    kind: 'message',
    role: 'assistant',
    timestamp: '2026-09-12T10:01:00.000Z',
}

function conversation(status: AgentConversation['status'] = 'completed'): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-09-12T10:02:00.000Z',
        entries: [
            { content: 'tool', id: 'event-1', kind: 'event', timestamp: '2026-09-12T09:59:00.000Z', type: 'tool' },
            firstMessage,
            assistantMessage,
        ],
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'design/activity/card__card-1.json#conversation=conversation-1',
        providerSessions: [],
        startedAt: '2026-09-12T10:00:00.000Z',
        status,
        title: 'Review',
        viewed: true,
    }
}

function operations(overrides: Partial<ActionConversationCommandOperations> = {}): ActionConversationCommandOperations {
    return {
        canSaveResponsePhrase: () => true,
        saveAsNewAction: vi.fn(async () => undefined),
        saveAsResponsePhrase: vi.fn(async () => undefined),
        split: vi.fn(async () => undefined),
        ...overrides,
    }
}

function renderCommands(
    message: AgentConversationMessageEntry,
    commands = operations(),
    value = conversation(),
) {
    render(
        <AppThemeProvider>
            <ActionConversationMessageCommands commands={commands} conversation={value} message={message} />
        </AppThemeProvider>,
    )

    return commands
}

function stubClipboard(clipboard: unknown) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard, writable: true })
}

describe('conversation item commands', () => {
    afterEach(() => {
        cleanup()
        projectAccessService.setReadOnly(false)
        stubClipboard(undefined)
        vi.restoreAllMocks()
    })

    it('offers Copy, Split, and only new-action Save for canonical first prompt', async () => {
        renderCommands(firstMessage)

        expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeEnabled()
        await userEvent.click(screen.getByRole('button', { name: 'Save message' }))
        const menu = screen.getByRole('menu')
        expect(within(menu).getByRole('menuitem', { name: 'Save as new action' })).toBeEnabled()
        expect(within(menu).queryByRole('menuitem', { name: 'Save as response phrase' })).not.toBeInTheDocument()
    })

    it('offers response-phrase Save for every later message and disables it for built-ins', async () => {
        const commands = operations({ canSaveResponsePhrase: () => false })
        renderCommands(assistantMessage, commands)

        await userEvent.click(screen.getByRole('button', { name: 'Save message' }))
        expect(screen.getByRole('menuitem', { name: 'Save as new action' })).toBeEnabled()
        expect(screen.getByRole('menuitem', { name: 'Save as response phrase' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('keeps Copy enabled and disables persistence commands in read-only projects', () => {
        projectAccessService.setReadOnly(true)
        renderCommands(assistantMessage)

        expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Save message' })).toBeDisabled()
    })

    it('disables Split while source conversation runs', () => {
        renderCommands(assistantMessage, operations(), conversation('running'))

        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeDisabled()
    })

    it('copies exact source Markdown', async () => {
        const writeText = vi.fn(async () => undefined)
        stubClipboard({ writeText })
        renderCommands(firstMessage)

        await userEvent.click(screen.getByRole('button', { name: 'Copy message' }))

        expect(writeText).toHaveBeenCalledWith(firstMessage.content)
    })

    it('saves dialog label with selected message and blocks duplicate submission', async () => {
        let finishSave: () => void = () => undefined
        const save = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve }))
        const commands = operations({ saveAsNewAction: save })
        renderCommands(assistantMessage, commands)
        await userEvent.click(screen.getByRole('button', { name: 'Save message' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Save as new action' }))
        expect(screen.getByText(assistantMessage.content)).toBeInTheDocument()
        await userEvent.type(screen.getByRole('textbox'), 'Saved response')

        const saveButton = screen.getByRole('button', { name: 'Save' })
        fireEvent.click(saveButton)
        fireEvent.click(saveButton)

        expect(save).toHaveBeenCalledTimes(1)
        expect(save).toHaveBeenCalledWith(assistantMessage, 'Saved response')
        finishSave()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('reports mutation and clipboard failures through dialogService', async () => {
        const error = vi.spyOn(dialogService, 'error').mockReturnValue({
            critical: false,
            id: 1,
            message: 'error',
            severity: 'error',
            title: 'Error',
        })
        const commands = operations({ split: vi.fn(async () => { throw new Error('split failed') }) })
        stubClipboard(undefined)
        document.execCommand = vi.fn(() => false)
        renderCommands(assistantMessage, commands)

        await userEvent.click(screen.getByRole('button', { name: 'Split conversation here' }))
        await userEvent.click(screen.getByRole('button', { name: 'Copy message' }))

        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Could not split conversation' })
        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Could not copy conversation item' })
    })

    it('gives event rows Copy only and copies complete collapsed detail', async () => {
        const writeText = vi.fn(async () => undefined)
        stubClipboard({ writeText })
        render(
            <AppThemeProvider>
                <ActionConversationEventRow
                    entry={{
                        command: 'npm test',
                        content: 'failure output',
                        durationMs: 25,
                        exitCode: 1,
                        id: 'event-1',
                        kind: 'event',
                        status: 'failed',
                        timestamp: '2026-09-12T10:00:00.000Z',
                        type: 'commandExecution',
                        workingDirectory: 'C:/repo',
                    }}
                    grouped={false}
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('button', { name: 'Split conversation here' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save message' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Copy event' }))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('### Working directory'))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('**Exit code:** 1'))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('**Duration:** 25 ms'))
    })

    it('keeps collapsed group headers free of item commands', () => {
        const tracker = {
            groupIsExpanded: () => false,
            subscribeExpansion: () => () => undefined,
            toggleExpansion: vi.fn(),
        } as unknown as ActionConversationChatlogTracker
        render(
            <AppThemeProvider>
                <TerminalToolCallGroup
                    entries={[
                        { content: 'one', id: 'event-1', kind: 'event', status: 'completed', timestamp: 'now', type: 'mcpToolCall' },
                        { content: 'two', id: 'event-2', kind: 'event', status: 'completed', timestamp: 'now', type: 'webSearch' },
                    ]}
                    groupKey="tools"
                    tracker={tracker}
                />
            </AppThemeProvider>,
        )

        const group = screen.getByRole('group', { name: 'Terminal tool calls' })
        expect(within(group).getByRole('button', { name: /Tools called/u })).toBeInTheDocument()
        expect(within(group).queryByRole('button', { name: 'Copy event' })).not.toBeInTheDocument()
        expect(within(group).queryByRole('button', { name: 'Split conversation here' })).not.toBeInTheDocument()
        expect(within(group).queryByRole('button', { name: 'Save message' })).not.toBeInTheDocument()
    })
})
