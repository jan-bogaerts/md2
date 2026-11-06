import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActionInputSplitter } from '../run/popup/action_input_splitter';
import { ActionLayoutSurface } from '../run/popup/action_layout_surface';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { AgentConversation, AgentQuestion } from '../../../data/data_types'
import { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import type { MarkdownDraftBinding } from '../../../services/markdown/markdown_draft'
import { createTestPopupRuntime } from '../../../test/action_popup_runtime_fixture'
import type { ActionConversationStore } from '../conversation/state/action_conversation_store'
import { dismissRestoredConversationQuestions, runPopupAction } from '../run/popup/action_popup_operations'
import type { ActionPopupRuntime } from '../run/popup/action_popup_types'

const editorRender = vi.hoisted(() => vi.fn());
const promptDraftState = vi.hoisted(() => ({ current: null as ActionPromptDraft | null }));
/** Called once per ActionAgentPrompt render through its run-settings hook. */
const promptRender = vi.hoisted(() => vi.fn());

vi.mock('../run/popup/action_popup_operations', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../run/popup/action_popup_operations')>()

    return {
        ...actual,
        answerRestoredConversationQuestions: vi.fn(async () => undefined),
        currentActionPromptDraft: () => {
            if (!promptDraftState.current) throw new Error('Test prompt draft is not configured')

            return promptDraftState.current
        },
        dismissRestoredConversationQuestions: vi.fn(async () => undefined),
        runPopupAction: vi.fn(async () => undefined),
    }
})

vi.mock('../shared/use_action_run_settings', () => ({
    useActionRunSettings: () => {
        promptRender()

        return { backendAvailable: true, runDisabledMessage: null }
    },
}))

vi.mock('../editor/action_phrase_buttons_owner', () => ({ActionPhraseButtonsOwner: () => <div>Predefined phrases</div>}))

vi.mock('../run/popup/action_popup_bottom_row', () => ({ActionPopupBottomRow: () => <div>Controls</div>}))

vi.mock('../../editor/markdown_editor', async () => {
    const { forwardRef, useEffect, useImperativeHandle, useRef, useState } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock(props: {
            attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
            draft: MarkdownDraftBinding
            flushOnBlur?: boolean
            hideAttachmentControl?: boolean
            imagePasteHandler?: (file: File, insertMarkdown: (markdown: string) => void) => Promise<void>
            localTextSearch?: boolean
            monospace?: boolean
            onChange?: (markdown: string) => void
            onLiveChange?: (markdown: string) => void
            placeholders?: readonly { name: string }[]
            plainText?: boolean
            readOnly?: boolean
        }, ref) {
            editorRender();
            const valueRef = useRef(props.draft.getSnapshot())
            const [value, setValue] = useState(props.draft.getSnapshot())
            useEffect(() => props.draft.subscribeEditor(() => {
                const replacement = props.draft.getSnapshot()
                valueRef.current = replacement
                setValue(replacement)
            }), [props.draft])
            useImperativeHandle(ref, () => ({
                flush: () => {
                    props.onChange?.(valueRef.current)

                    return true
                },
                getMarkdown: () => valueRef.current,
                setMarkdown: (markdown: string) => {
                    valueRef.current = markdown
                    setValue(markdown)
                },
            }))

            return (
                <textarea
                    aria-label="Markdown prompt"
                    data-flush-on-blur={props.flushOnBlur ? 'true' : 'false'}
                    data-has-attachment-handler={props.attachmentHandler ? 'true' : 'false'}
                    data-hide-attachment-control={props.hideAttachmentControl ? 'true' : 'false'}
                    data-image-paste={props.imagePasteHandler ? 'true' : 'false'}
                    data-local-text-search={props.localTextSearch === false ? 'false' : 'true'}
                    data-monospace={props.monospace ? 'true' : 'false'}
                    data-placeholders={props.placeholders?.map(({ name }) => name).join(',')}
                    data-plain-text={props.plainText ? 'true' : 'false'}
                    value={value}
                    onBlur={(event) => props.onChange?.(event.currentTarget.value)}
                    onChange={(event) => {
                        valueRef.current = event.currentTarget.value
                        setValue(event.currentTarget.value)
                        props.draft.edit(event.currentTarget.value)
                        props.onLiveChange?.(event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return

                        const nextValue = `${valueRef.current}\n`
                        valueRef.current = nextValue
                        setValue(nextValue)
                        props.draft.edit(nextValue)
                        props.onLiveChange?.(nextValue)
                    }}
                    readOnly={props.readOnly}
                />
            )
        }),
    }
})

const context: ActionContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' }
const agentAction = {id: 'review', label: 'Review', phrases: [], prompt: 'Review', type: 'agent'} as unknown as ActionDefinition
const commandAction = {command: 'npm test', id: 'build', label: 'Build', type: 'command'} as unknown as ActionDefinition

interface ConversationSnapshotInput {
    loading: boolean
    selectedConversation: AgentConversation | null
}

/** Conversation store stand-in whose selection can be replaced by a test. */
class TestConversationStore extends EventTarget {
    private snapshot: ConversationSnapshotInput & { conversations: AgentConversation[]; pinningConversationId: null }

    constructor(input: ConversationSnapshotInput) {
        super()
        this.snapshot = { ...input, conversations: [], pinningConversationId: null }
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    conversationOptions() {
        return this.snapshot.conversations
    }

    select(selectedConversation: AgentConversation | null) {
        this.snapshot = { ...this.snapshot, loading: false, selectedConversation }
        this.dispatchEvent(new Event('changed'))
    }
}

function waitingConversation(questions: AgentQuestion[]) {
    return {
        entries: [{ kind: 'event', questions, type: 'agentQuestion' }],
        id: 'conversation-1',
        status: 'waitingForInput',
    } as unknown as AgentConversation
}

interface RenderPromptOptions {
    action?: ActionDefinition
    conversationStore?: TestConversationStore
    questionsEnabled?: boolean
    withSurface?: boolean
}

function createRuntime(action: ActionDefinition, conversationStore: TestConversationStore) {
    const overrides = { conversationStore: conversationStore as unknown as ActionConversationStore }

    return createTestPopupRuntime(action, context, overrides)
}

function promptElement(action: ActionDefinition, runtime: ActionPopupRuntime, questionsEnabled: boolean) {
    return (
        <ActionAgentPrompt
            action={action}
            assignmentContext={context}
            questionsEnabled={questionsEnabled}
            runtime={runtime}
            scheduleContext={context}
        />
    )
}

function renderPrompt(promptDraft: ActionPromptDraft, options: RenderPromptOptions = {}) {
    const {
        action = agentAction,
        conversationStore = new TestConversationStore({ loading: true, selectedConversation: null }),
        questionsEnabled = true,
        withSurface = true,
    } = options
    promptDraftState.current = promptDraft
    const runtime = createRuntime(action, conversationStore)
    const layoutStore = questionsEnabled ? runtime.agentLayoutStore : runtime.commandLayoutStore
    const prompt = promptElement(action, runtime, questionsEnabled)
    render(withSurface ? (
        <ActionLayoutSurface store={layoutStore}>
            <ActionInputSplitter store={layoutStore} />
            {prompt}
        </ActionLayoutSurface>
    ) : prompt)

    return { conversationStore, runtime }
}

function mockAvailablePromptHeight(height: number, questionsHeight = 96) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measureElement(this: HTMLElement) {
        const measuredHeight = this.getAttribute('role') === 'separator' ? 0
            : this.dataset.testid === 'action-questions-region' ? questionsHeight : height

        return {
            bottom: measuredHeight,
            height: measuredHeight,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }
    })
}

beforeEach(() => window.localStorage.clear())

afterEach(() => {
    cleanup()
    promptDraftState.current = null
    vi.restoreAllMocks()
    vi.mocked(runPopupAction).mockClear()
    vi.mocked(dismissRestoredConversationQuestions).mockClear()
})

describe('ActionAgentPrompt', () => {
    it('renders editor without a separator or writing layout preferences', () => {
        renderPrompt(new ActionPromptDraft('Plan', false), { withSurface: false })

        expect(screen.getByRole('textbox', { name: 'Markdown prompt' })).toHaveValue('Plan');
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBeNull();
        expect(window.localStorage.getItem('md2.commandActionInputHeight')).toBeNull();
    });

    it.each([false, true])('keeps editor stable across nonempty draft edits with pending questions %s', (pendingQuestions) => {
        const draft = new ActionPromptDraft('Plan', false);
        const question = { header: 'Choose', id: 'question-1', options: [{ label: 'Yes', description: 'Continue' }], question: 'Continue?' }
        const selectedConversation = pendingQuestions ? waitingConversation([question]) : null
        const conversationStore = new TestConversationStore({ loading: false, selectedConversation })
        renderPrompt(draft, { conversationStore })
        editorRender.mockClear();
        act(() => draft.edit('Plan more'));
        act(() => draft.edit('Plan more text'));
        expect(editorRender).not.toHaveBeenCalled();
        expect(draft.getSnapshot()).toBe('Plan more text');
        act(() => draft.replace('External prompt'));
        expect(screen.getByRole('textbox', { name: 'Markdown prompt' })).toHaveValue('External prompt');
    });

    it('stays read-only during prompt preparation and becomes editable when ready', async () => {
        const promptDraft = new ActionPromptDraft('', true)
        renderPrompt(promptDraft)
        const prompt = screen.getByLabelText('Markdown prompt')

        expect(prompt).toHaveAttribute('readonly')

        await act(async () => promptDraft.prepare(async () => ({ prompt: 'Prepared prompt' })))

        expect(prompt).not.toHaveAttribute('readonly')
        expect(prompt).toHaveValue('Prepared prompt')
    })

    it('passes a card attachment handler to the hidden-toolbar agent prompt editor', () => {
        renderPrompt(new ActionPromptDraft('', false))

        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-has-attachment-handler', 'true')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-hide-attachment-control', 'true')
    })

    it('configures action placeholders on its hidden-toolbar editor', () => {
        renderPrompt(new ActionPromptDraft('', false))

        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute(
            'data-placeholders',
            ACTION_PROMPT_PLACEHOLDERS.map(({ name }) => name).join(','),
        )
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('this-card')
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('active-cards-folder')
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('diagram-changes')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-local-text-search', 'false')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-image-paste', 'false')
    })

    it('edits command input as monospace literal text without attachments or phrases', () => {
        renderPrompt(new ActionPromptDraft('npm test', false), { action: commandAction, questionsEnabled: false })
        const prompt = screen.getByLabelText('Markdown prompt')

        expect(prompt).toHaveAttribute('data-monospace', 'true')
        expect(prompt).toHaveAttribute('data-plain-text', 'true')
        expect(prompt).toHaveAttribute('data-has-attachment-handler', 'false')
        expect(screen.queryByText('Predefined phrases')).not.toBeInTheDocument()
        expect(screen.getByText('Controls')).toBeInTheDocument()
    })

    it('keeps typing local when prompt loses focus', () => {
        const promptDraft = new ActionPromptDraft('', false)
        renderPrompt(promptDraft)
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Draft' } })

        expect(promptDraft.getSnapshot()).toBe('Draft')
        expect(prompt).toHaveAttribute('data-flush-on-blur', 'true')

        fireEvent.blur(prompt)

        expect(promptDraft.getSnapshot()).toBe('Draft')
    })

    it.each([
        { keyModifier: { ctrlKey: true }, shortcut: 'Ctrl+Enter' },
        { keyModifier: { metaKey: true }, shortcut: 'Meta+Enter' },
    ])('flushes the latest prompt before running $shortcut without passing it to the editor', ({ keyModifier }) => {
        const promptDraft = new ActionPromptDraft('', false)
        renderPrompt(promptDraft)
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Run this' } })
        fireEvent.keyDown(prompt, { ...keyModifier, key: 'Enter' })

        expect(runPopupAction).toHaveBeenCalledOnce()
        expect(promptDraft.getSnapshot()).toBe('Run this')
        expect(prompt).toHaveValue('Run this')
    })

    it('does not run a command through Ctrl+Enter while its input is empty', () => {
        renderPrompt(new ActionPromptDraft('', false), { action: commandAction, questionsEnabled: false })

        fireEvent.keyDown(screen.getByLabelText('Markdown prompt'), { ctrlKey: true, key: 'Enter' })

        expect(runPopupAction).not.toHaveBeenCalled()
    })

    it('keeps plain Enter and Shift+Enter editor behavior', () => {
        const promptDraft = new ActionPromptDraft('Line', false)
        renderPrompt(promptDraft)
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.keyDown(prompt, { key: 'Enter' })
        fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true })

        expect(promptDraft.getSnapshot()).toBe('Line\n\n')
        expect(prompt).toHaveValue('Line\n\n')
        expect(runPopupAction).not.toHaveBeenCalled()
    })

    it('applies each external replacement to the mounted editor once', () => {
        const promptDraft = new ActionPromptDraft('Initial', false)
        renderPrompt(promptDraft)
        act(() => promptDraft.replace('Prepared'))

        expect(screen.getByLabelText('Markdown prompt')).toHaveValue('Prepared')
    })

    it.each(['', '   \n\t'])('collapses only the editor region for an empty draft %#', (value) => {
        renderPrompt(new ActionPromptDraft(value, false))

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(screen.getByTestId('action-prompt-editor-region')).toHaveStyle({ height: '56px', overflowY: 'auto' })
        expect(screen.getByText('Predefined phrases')).toBeInTheDocument()
        expect(screen.getByText('Controls')).toBeInTheDocument()
    })

    it('shows the conversion message from its input store', () => {
        const { runtime } = renderPrompt(new ActionPromptDraft('Plan', false))

        act(() => runtime.inputStore.setConvertMessage('Converted to agent prompt'))

        expect(screen.getByRole('status')).toHaveTextContent('Converted to agent prompt')
    })

    it('disables pointer and keyboard resize while the prompt is empty', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        renderPrompt(new ActionPromptDraft('', false))
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        expect(separator).toHaveAttribute('aria-disabled', 'true')
        expect(separator).toHaveAttribute('tabindex', '-1')
        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 1 })
        fireEvent.pointerMove(separator, { clientY: 100, pointerId: 1 })
        fireEvent.pointerUp(separator, { clientY: 100, pointerId: 1 })
        fireEvent.keyDown(separator, { key: 'ArrowUp' })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('160')
    })

    it.each([
        {
            action: agentAction,
            label: 'Resize prompt',
            pointerEndY: 176,
            questionsEnabled: true,
            storageKey: 'md2.actionPromptHeight',
        },
        {
            action: commandAction,
            label: 'Resize command input',
            pointerEndY: 224,
            questionsEnabled: false,
            storageKey: 'md2.commandActionInputHeight',
        },
    ])('drag-resizes a height-driven prompt-only $label layout', (testCase) => {
        mockAvailablePromptHeight(400)
        renderPrompt(new ActionPromptDraft('Input', false), testCase)
        const prompt = screen.getByLabelText('Prompt')
        const separator = screen.getByRole('separator', { name: testCase.label })

        expect(prompt).toHaveStyle({ flex: '0 0 auto', height: '140px' })

        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 6 })
        fireEvent.pointerMove(separator, { clientY: testCase.pointerEndY, pointerId: 6 })
        fireEvent.pointerUp(separator, { clientY: testCase.pointerEndY, pointerId: 6 })

        expect(prompt).toHaveStyle({ flex: '0 0 auto', height: '164px' })
        expect(window.localStorage.getItem(testCase.storageKey)).toBe('164')
    })

    it('restores the saved height on live text entry and preserves it across empty transitions', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '188')
        mockAvailablePromptHeight(400)
        renderPrompt(new ActionPromptDraft('', false))
        const prompt = screen.getByLabelText('Markdown prompt')
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        fireEvent.change(prompt, { target: { value: 'Plan' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '188px' })
        expect(separator).not.toHaveAttribute('aria-disabled')
        expect(separator).toHaveAttribute('tabindex', '0')

        fireEvent.change(prompt, { target: { value: '   ' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('188')

        fireEvent.change(prompt, { target: { value: 'Continue' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '188px' })
    })

    it('clamps a restored height against the available popup height', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '220')
        mockAvailablePromptHeight(250)
        renderPrompt(new ActionPromptDraft('', false))

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '154px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('220')
    })

    it('persists non-empty pointer and keyboard resize without overwriting it after clearing', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        mockAvailablePromptHeight(400)
        renderPrompt(new ActionPromptDraft('Plan', false))
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 2 })
        fireEvent.pointerMove(separator, { clientY: 160, pointerId: 2 })
        fireEvent.pointerUp(separator, { clientY: 160, pointerId: 2 })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '200px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('200')

        fireEvent.keyDown(separator, { key: 'ArrowDown' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '176px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('176')

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: '' } })
        fireEvent.keyDown(separator, { key: 'ArrowUp' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('176')
    })
})

describe('ActionAgentPrompt with a pending question', () => {
    const questions: AgentQuestion[] = [{ header: 'Reason', id: 'reason', question: 'Why?' }]

    function renderPendingQuestion(promptDraft = new ActionPromptDraft('', false)) {
        const conversationStore = new TestConversationStore({ loading: false, selectedConversation: waitingConversation(questions) })

        return renderPrompt(promptDraft, { conversationStore })
    }

    it('sizes unsized questions to their content below the cap and lets the prompt fill the rest', () => {
        mockAvailablePromptHeight(400)

        renderPendingQuestion()

        expect(screen.getByText('Why?')).toBeInTheDocument()
        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '300px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({
            flex: '0 1 auto',
            maxHeight: '160px',
            minHeight: '0',
            overflowY: 'auto',
        })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ flex: '1', height: 'auto', minHeight: '72px' })
        expect(screen.getByTestId('action-prompt-editor-region')).toHaveStyle({ flex: '1' })
    })

    it('caps and scrolls unsized questions that exceed the cap while the prompt keeps its minimum', () => {
        mockAvailablePromptHeight(400, 600)

        renderPendingQuestion()

        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ maxHeight: '160px', overflowY: 'auto' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ minHeight: '72px' })
    })

    it('bounds questions to the available space in a short agent column', () => {
        mockAvailablePromptHeight(120)

        renderPendingQuestion()

        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ maxHeight: '48px' })
    })

    it('renders at most twice for a question update: run state, then the layout snapshot', () => {
        mockAvailablePromptHeight(400)
        const conversationStore = new TestConversationStore({ loading: false, selectedConversation: null })
        renderPrompt(new ActionPromptDraft('', false), { conversationStore })
        promptRender.mockClear()

        act(() => conversationStore.select(waitingConversation(questions)))

        expect(screen.getByText('Why?')).toBeInTheDocument()
        expect(promptRender).toHaveBeenCalledTimes(2)
    })

    it('starts with the question region primary when a stored block height exists', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)

        renderPendingQuestion()

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ flex: '0 0 auto', height: '72px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({
            flex: '1',
            minHeight: '96px',
        })
    })

    it('makes the prompt primary after non-whitespace live input', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)

        renderPendingQuestion()
        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '204px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({
            flex: '0 0 auto',
            height: '96px',
        })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('300')
    })

    it('recovers both regions repeatedly through prompt edits and question pointer-down', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)
        renderPendingQuestion()
        const prompt = screen.getByLabelText('Markdown prompt')
        const questionsRegion = screen.getByTestId('action-questions-region')

        fireEvent.change(prompt, { target: { value: 'First' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '204px' })

        fireEvent.pointerDown(questionsRegion)
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Because' } })

        fireEvent.change(prompt, { target: { value: 'Second' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '204px' })

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Cancel questions' }))
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        expect(dismissRestoredConversationQuestions).not.toHaveBeenCalled()
        expect(prompt).toHaveValue('Second')
        expect(screen.getByRole('textbox', { name: 'Why?' })).toHaveValue('Because')
    })

    it('makes the question region primary when keyboard focus enters a question control', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)

        renderPendingQuestion()
        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })
        const answer = screen.getByRole('textbox', { name: 'Why?' })
        answer.focus()
        fireEvent.focusIn(answer)

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        expect(answer).toHaveFocus()
    })

    it('measures an unsized block before switching without persisting its total height', () => {
        mockAvailablePromptHeight(280)

        renderPendingQuestion()
        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '184px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '88px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBeNull()
    })

    it('preserves prompt primary while drag and keyboard resize change the block total', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '140')
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)

        renderPendingQuestion(new ActionPromptDraft('Plan', false))
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Updated plan' } })
        fireEvent.pointerDown(separator, { clientY: 300, pointerId: 3 })
        fireEvent.pointerMove(separator, { clientY: 344, pointerId: 3 })
        fireEvent.pointerUp(separator, { clientY: 344, pointerId: 3 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '256px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '160px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ height: '96px' })

        fireEvent.keyDown(separator, { key: 'ArrowDown' })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '232px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '136px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('232')
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('140')
    })

    it('preserves question primary while keyboard resize changes the block total', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '260')
        mockAvailablePromptHeight(400)

        renderPendingQuestion()
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        fireEvent.keyDown(separator, { key: 'ArrowUp' })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '284px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ flex: '1' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('284')
    })

    it('stops at both region floors and the chat minimum', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)

        renderPendingQuestion()
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        fireEvent.pointerDown(separator, { clientY: 300, pointerId: 4 })
        fireEvent.pointerMove(separator, { clientY: 900, pointerId: 4 })
        fireEvent.pointerUp(separator, { clientY: 900, pointerId: 4 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '168px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ minHeight: '96px' })

        fireEvent.pointerDown(separator, { clientY: 300, pointerId: 5 })
        fireEvent.pointerMove(separator, { clientY: -500, pointerId: 5 })
        fireEvent.pointerUp(separator, { clientY: -500, pointerId: 5 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '304px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('304')
    })

    it('keeps the resize bar active while the prompt is empty', () => {
        mockAvailablePromptHeight(400)

        renderPendingQuestion()
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        expect(separator).not.toHaveAttribute('aria-disabled')
        expect(separator).toHaveAttribute('tabindex', '0')
        expect(separator).toHaveAttribute('aria-valuemin', '168')
    })

    it('ignores pending questions and question storage when questions are disabled', () => {
        window.localStorage.setItem('md2.commandActionInputHeight', '160')
        mockAvailablePromptHeight(400)
        const conversationStore = new TestConversationStore({ loading: false, selectedConversation: waitingConversation(questions) })
        renderPrompt(new ActionPromptDraft('npm test', false), { action: commandAction, conversationStore, questionsEnabled: false })
        const separator = screen.getByRole('separator', { name: 'Resize command input' })

        fireEvent.keyDown(separator, { key: 'ArrowUp' })

        expect(screen.queryByTestId('action-questions-region')).not.toBeInTheDocument()
        expect(separator).toHaveAttribute('aria-valuemin', '72')
        expect(window.localStorage.getItem('md2.commandActionInputHeight')).toBe('136')
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBeNull()
    })
})
