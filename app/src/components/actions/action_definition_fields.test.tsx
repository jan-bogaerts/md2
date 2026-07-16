import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import { configService } from '../../services/config_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionDefinitionFields } from './action_definition_fields'

const sharedFields = {
    appliesTo: { kind: 'card' },
    description: 'Run checks',
    id: 'check-action',
    label: 'Check',
    name: 'check',
    needsWorkTree: true,
    onAfter: ['after'],
    onBefore: ['before'],
    onState: 'ready',
}

function renderFields(definition: RawActionDefinition, onChange = vi.fn()) {
    render(
        <AppThemeProvider>
            <ActionDefinitionFields
                actions={[
                    { id: 'before', label: 'Before' },
                    { id: 'after', label: 'After' },
                ] as ActionDefinition[]}
                cardTypes={['feature']}
                definition={definition}
                errorIndex={null}
                errors={{}}
                onChange={onChange}
                repositoryFiles={[]}
                specialContextTypes={['actions']}
                states={['ready']}
                worktrees={[]}
            />
        </AppThemeProvider>,
    )

    return onChange
}

function selectType(label: string) {
    fireEvent.mouseDown(screen.getByLabelText('Type'))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: label }))
}

describe('ActionDefinitionFields', () => {
    beforeEach(() => configService.init())

    afterEach(() => {
        cleanup()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('changes an agent action to command and clears only agent-specific fields', () => {
        const definition: RawActionDefinition = {
            ...sharedFields,
            agent: 'codex',
            model: 'gpt-5',
            prompt: 'Keep this prompt until type changes',
            thinkingLevel: 'high',
            type: 'agent',
        }
        const onChange = renderFields(definition)

        selectType('Command')

        expect(onChange).toHaveBeenCalledWith({
            ...sharedFields,
            agent: undefined,
            command: '',
            model: undefined,
            prompt: undefined,
            thinkingLevel: undefined,
            type: 'command',
        })
    })

    it('changes a command action to agent and preserves every shared field', () => {
        const definition: RawActionDefinition = {
            ...sharedFields,
            command: 'npm run test',
            type: 'command',
        }
        const onChange = renderFields(definition)

        selectType('Agent')

        expect(onChange).toHaveBeenCalledWith({
            ...sharedFields,
            command: undefined,
            prompt: '',
            type: 'agent',
        })
    })

    it('renders command fields and routes helper text to its control', () => {
        renderFields({ ...sharedFields, command: '', type: 'command' }, vi.fn())

        expect(screen.getByLabelText('Command')).toHaveValue('')
        expect(screen.getByLabelText('Needs worktree')).toBeChecked()
        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('ready')
    })

    it('renders section headings and empty-state hints for empty collections', () => {
        renderFields({
            command: 'run',
            description: 'Run checks',
            id: 'check-action',
            label: 'Check',
            name: 'check',
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
