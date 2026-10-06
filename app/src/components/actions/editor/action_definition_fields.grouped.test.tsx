import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, RawActionDefinition } from '../../../data/action_types'
import { actionService } from '../../../services/actions/action_service'
import { configService } from '../../../services/config/config_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionDefinitionFields } from './action_definition_fields'

const sharedFields = {
    appliesTo: { kind: 'card' },
    description: 'Run checks',
    id: 'check-action',
    label: 'Check',
    needsWorkTree: true,
    onAfter: ['after'],
    onBefore: ['before'],
    onState: 'ready',
}

const SOURCE_PATH = 'actions/check.json'

function renderFields(definition: RawActionDefinition) {
    const persistedDefinition = definition.type === 'command' && !definition.command
        ? { ...definition, command: 'run' }
        : definition
    actionService.loadFromFiles([
        { content: JSON.stringify(persistedDefinition), path: SOURCE_PATH },
        { content: JSON.stringify({ command: 'before', description: 'Before', id: 'before', label: 'Before', type: 'command' }), path: 'actions/before.json' },
        { content: JSON.stringify({ command: 'after', description: 'After', id: 'after', label: 'After', type: 'command' }), path: 'actions/after.json' },
    ])
    actionService.draftStore.getDraft(definition.id)
    actionService.draftStore.stageDraft(definition.id, definition)
    render(
        <AppThemeProvider>
            <ActionDefinitionFields
                actionId={definition.id}
                actions={[
                    { id: 'before', label: 'Before' },
                    { id: 'after', label: 'After' },
                ] as ActionDefinition[]}
                cardTypes={['feature']}
                sourcePath={SOURCE_PATH}
                specialContextTypes={['actions']}
                states={['ready']}
                worktrees={[]}
            />
        </AppThemeProvider>,
    )

    return () => actionService.draftStore.getDraft(definition.id).definition
}

function selectType(label: string) {
    fireEvent.mouseDown(screen.getByLabelText('Type'))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: label }))
}

describe('ActionDefinitionFields', () => {
    beforeEach(() => configService.init())

    afterEach(() => {
        cleanup()
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('shows Regular and default labels when optional definition fields are absent', () => {
        const definition = {
            command: 'run',
            description: 'Run checks',
            id: 'check-action',
            label: 'Check',
            type: 'command',
        } satisfies RawActionDefinition;
        const getDefinition = renderFields(definition);

        expect(screen.getByLabelText('Output kind')).toHaveTextContent('Regular');
        expect(screen.getByLabelText('Icon')).toHaveTextContent('No icon');
        expect(screen.getByLabelText('Ask user for')).toHaveTextContent('None');
        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('No state trigger');
        expect(getDefinition().output).toBeUndefined();
    });

    it('shows Regular and clears output when Diagram changes to Regular', async () => {
        const user = userEvent.setup();
        const definition = {
            ...sharedFields,
            command: 'run',
            output: { kind: 'diagram' },
            type: 'command',
        } satisfies RawActionDefinition;
        const getDefinition = renderFields(definition);

        expect(screen.getByLabelText('Output kind')).toHaveTextContent('Diagram');
        await user.click(screen.getByLabelText('Output kind'));
        await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Regular' }));

        expect(screen.getByLabelText('Output kind')).toHaveTextContent('Regular');
        expect(getDefinition().output).toBeUndefined();
    });

    it('groups agent controls under four ordered definition headings', () => {
        renderFields({
            ...sharedFields,
            autoFinish: { state: 'ready', when: 'card-state' },
            prompt: 'Plan first',
            streaming: true,
            type: 'agent',
            userInput: { prompt: 'Which build?', type: 'version' },
        })

        expect(screen.getByRole('heading', { level: 2, name: 'Action definition' })).toBeInTheDocument()
        expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
            'Action details', 'Run settings', 'Availability', 'Action sequence',
        ])
        const details = within(screen.getByRole('region', { name: 'Action details' }))
        const runSettings = within(screen.getByRole('region', { name: 'Run settings' }))
        const availability = within(screen.getByRole('region', { name: 'Availability' }))
        const sequence = within(screen.getByRole('region', { name: 'Action sequence' }))

        expect(details.getByText('Name and describe this action, its output, and any input requested before it runs.')).toBeInTheDocument()
        expect(details.getByLabelText('Label')).toBeInTheDocument()
        expect(details.getByLabelText('Type')).toBeInTheDocument()
        expect(details.getByLabelText('Output kind')).toBeInTheDocument()
        expect(details.getByLabelText('Icon')).toBeInTheDocument()
        expect(details.getByLabelText('Description')).toBeInTheDocument()
        expect(details.getByLabelText('Ask user for')).toBeInTheDocument()
        expect(details.getByLabelText('Version question (optional)')).toBeInTheDocument()

        expect(runSettings.getByText('Choose when this action starts and how its agent or command runs.')).toBeInTheDocument()
        expect(runSettings.getByLabelText('Run when card enters state')).toBeInTheDocument()
        expect(runSettings.getByRole('switch', { name: 'Needs worktree' })).toBeInTheDocument()
        expect(runSettings.getByRole('switch', { name: 'Auto commit' })).toBeInTheDocument()
        expect(runSettings.getByRole('switch', { name: 'Streaming' })).toBeInTheDocument()
        expect(runSettings.getByRole('switch', { name: 'Auto finish' })).toBeInTheDocument()
        expect(runSettings.getByLabelText('Auto finish trigger')).toBeInTheDocument()
        expect(runSettings.getByLabelText('Auto finish card state')).toBeInTheDocument()
        expect(runSettings.getByRole('heading', { level: 4, name: 'Agent override' })).toBeInTheDocument()
        expect(runSettings.queryByLabelText('Command')).not.toBeInTheDocument()

        expect(availability.getByText('Limit the card or project contexts where this action is available.')).toBeInTheDocument()
        expect(availability.getByRole('heading', { level: 4, name: 'Applicability filters' })).toBeInTheDocument()
        expect(sequence.getByText('Run linked actions before this action, when its output matches a regular expression, or after it finishes.')).toBeInTheDocument()
        expect(sequence.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual(['Before', 'Output rules', 'After'])
    })

    it('keeps command controls in their groups and excludes agent controls', () => {
        renderFields({ ...sharedFields, command: 'npm run test', type: 'command' })

        const runSettings = within(screen.getByRole('region', { name: 'Run settings' }))
        const sequence = within(screen.getByRole('region', { name: 'Action sequence' }))

        expect(runSettings.getByRole('switch', { name: 'Show command window' })).toBeInTheDocument()
        expect(runSettings.getByLabelText('Command')).toHaveValue('npm run test')
        expect(runSettings.queryByRole('heading', { name: 'Agent override' })).not.toBeInTheDocument()
        expect(runSettings.queryByRole('switch', { name: 'Auto commit' })).not.toBeInTheDocument()
        expect(runSettings.queryByRole('switch', { name: 'Streaming' })).not.toBeInTheDocument()
        expect(runSettings.queryByRole('switch', { name: 'Auto finish' })).not.toBeInTheDocument()
        expect(sequence.getByRole('group', { name: 'Before action 1' })).toBeInTheDocument()
        expect(sequence.getByRole('group', { name: 'After action 1' })).toBeInTheDocument()
    })

    it('selects version input and keeps its custom question in the draft', () => {
        const getDefinition = renderFields({ ...sharedFields, command: 'echo {{version}}', type: 'command' })
        fireEvent.mouseDown(screen.getByLabelText('Ask user for'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Version' }))
        fireEvent.change(screen.getByLabelText('Version question (optional)'), { target: { value: 'Which build?' } })

        expect(getDefinition().userInput).toEqual({ prompt: 'Which build?', type: 'version' })
    })

    it('changes an agent action to command and clears only agent-specific fields', () => {
        const definition: RawActionDefinition = {
            ...sharedFields,
            agent: 'codex',
            model: 'gpt-5',
            prompt: 'Keep this prompt until type changes',
            thinkingLevel: 'high',
            trackFileChanges: true,
            type: 'agent',
        }
        const getDefinition = renderFields(definition)

        selectType('Command')

        expect(getDefinition()).toEqual({
            ...sharedFields,
            agent: undefined,
            command: '',
            model: undefined,
            prompt: undefined,
            thinkingLevel: undefined,
            trackFileChanges: undefined,
            type: 'command',
        })
    })

    it('changes a command action to agent and preserves every shared field', () => {
        const definition: RawActionDefinition = {
            ...sharedFields,
            command: 'npm run test',
            type: 'command',
        }
        const getDefinition = renderFields(definition)

        selectType('Agent')

        expect(getDefinition()).toEqual({
            ...sharedFields,
            command: undefined,
            prompt: '',
            showCommandWindow: undefined,
            type: 'agent',
        })
    })

    it('renders command fields and routes helper text to its control', () => {
        renderFields({ ...sharedFields, command: '', type: 'command' })

        expect(screen.getByLabelText('Command')).toHaveValue('')
        expect(screen.getByRole('switch', { name: 'Needs worktree' })).toBeChecked()
        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('ready')
        expect(screen.queryByRole('switch', { name: 'Auto commit' })).not.toBeInTheDocument()
        expect(screen.queryByRole('switch', { name: 'Streaming' })).not.toBeInTheDocument()
        expect(screen.getByRole('switch', { name: 'Show command window' })).not.toBeChecked()
    })

    it('shows and persists command-window visibility', () => {
        const definition = {
            ...sharedFields,
            command: 'npm run test',
            type: 'command',
        } satisfies RawActionDefinition
        const getDefinition = renderFields(definition)
        const commandWindowSwitch = screen.getByRole('switch', { name: 'Show command window' })

        fireEvent.click(commandWindowSwitch)

        expect(getDefinition()).toEqual({ ...definition, showCommandWindow: true })
    })

    it('shows and persists agent streaming', () => {
        const definition = {
            ...sharedFields,
            prompt: 'Plan first',
            type: 'agent',
        } satisfies RawActionDefinition
        const getDefinition = renderFields(definition)
        const streamingSwitch = screen.getByRole('switch', { name: 'Streaming' })

        expect(streamingSwitch).not.toBeChecked()
        fireEvent.click(streamingSwitch)

        expect(getDefinition()).toEqual({ ...definition, streaming: true })
    })

    it('configures auto finish only for streaming agents', () => {
        const definition = {
            ...sharedFields,
            prompt: 'Plan first',
            streaming: true,
            type: 'agent',
        } satisfies RawActionDefinition
        const getDefinition = renderFields(definition)
        const autoFinishSwitch = screen.getByRole('switch', { name: 'Auto finish' })

        fireEvent.click(autoFinishSwitch)

        expect(getDefinition()).toEqual({ ...definition, autoFinish: { state: 'ready', when: 'card-state' } })
        expect(screen.getByLabelText('Auto finish trigger')).toHaveTextContent('When card enters state')
        expect(screen.getByLabelText('Auto finish card state')).toHaveTextContent('ready')
        fireEvent.click(screen.getByRole('switch', { name: 'Streaming' }))
        expect(getDefinition()).toEqual({ ...definition, autoFinish: undefined, streaming: undefined })
    })

    it('edits diagram output independently and offers diagram-created auto finish', () => {
        const definition = {
            ...sharedFields,
            appliesTo: { kind: 'diagram', type: 'root' },
            output: { kind: 'diagram' },
            prompt: 'Create diagram',
            streaming: true,
            type: 'agent',
        } satisfies RawActionDefinition
        const getDefinition = renderFields(definition)

        expect(screen.getByLabelText('Output kind')).toHaveTextContent('Diagram')
        fireEvent.click(screen.getByRole('switch', { name: 'Auto finish' }))

        expect(getDefinition()).toEqual({ ...definition, autoFinish: { when: 'diagram-created' } })
        expect(screen.getByLabelText('Auto finish trigger')).toHaveTextContent('When diagram is created')
        expect(screen.queryByLabelText('Auto finish card state')).not.toBeInTheDocument()
        expect(getDefinition().appliesTo).toEqual({ kind: 'diagram', type: 'root' })
    })

    it('shows and persists agent file-change tracking with its limitations', () => {
        const definition = {
            ...sharedFields,
            prompt: 'Edit one file',
            type: 'agent',
        } satisfies RawActionDefinition
        const getDefinition = renderFields(definition)
        const trackingSwitch = screen.getByRole('switch', { name: 'Auto commit' })

        expect(trackingSwitch).not.toBeChecked()
        expect(screen.getByText(/auto commit files agent reported as modified/u)).toBeInTheDocument()
        fireEvent.click(trackingSwitch)

        expect(getDefinition()).toEqual({ ...definition, trackFileChanges: true })
    })

    it('orders action details as label, description, type, output kind, icon, ask user for without exposing internal identity fields', () => {
        renderFields({ ...sharedFields, command: 'run', icon: 'icon.svg', type: 'command' })

        const orderedFields = ['Label', 'Description', 'Type', 'Output kind', 'Icon', 'Ask user for'].map((fieldLabel) => screen.getByLabelText(fieldLabel))

        expect(screen.queryByLabelText('ID')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
        orderedFields.slice(1).forEach((field, index) => {
            expect(orderedFields[index].compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })
    })

    it('shows version question after ask user for when version input is selected', () => {
        renderFields({ ...sharedFields, command: 'run', type: 'command', userInput: { prompt: 'Which build?', type: 'version' } })

        const askUserFor = screen.getByLabelText('Ask user for')
        const versionQuestion = screen.getByLabelText('Version question (optional)')

        expect(versionQuestion).toHaveValue('Which build?')
        expect(askUserFor.compareDocumentPosition(versionQuestion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('renders section headings and empty-state hints for empty collections', () => {
        renderFields({
            command: 'run',
            description: 'Run checks',
            id: 'check-action',
            label: 'Check',
            type: 'command',
        })

        expect(screen.getByRole('heading', { name: 'Action definition' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Applicability filters' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Output rules' })).toBeInTheDocument()
        expect(screen.getByText('No filters. The action is available in every context.')).toBeInTheDocument()
        expect(screen.getByText('No actions run before this one.')).toBeInTheDocument()
        expect(screen.getByText('No actions run after this one.')).toBeInTheDocument()
        expect(screen.getByText('No output rules. Output does not trigger follow-up actions.')).toBeInTheDocument()
    })
})
