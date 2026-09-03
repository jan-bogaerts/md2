import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigEntry } from '../../services/config/config_service'
import { dialogService } from '../../services/dialog_service'
import { ConfigValueEditor } from './config_value_editor'

const desktopSelectionEntry: ConfigEntry = {
    defaultValue: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: {} },
    description: 'Desktop selection.',
    editable: true,
    key: 'desktop.agentSelection',
    label: 'Desktop agent selection',
    section: 'desktop',
    source: 'desktop',
    type: 'json',
}

describe('ConfigValueEditor', () => {
    it('reports invalid slider config without crashing the config page', () => {
        const entry: ConfigEntry = {
            defaultValue: 30000,
            description: 'Invalid slider.',
            editable: true,
            input: 'slider',
            key: 'react.autoCommitDelayMs',
            label: 'Auto commit delay',
            section: 'react',
            source: 'react',
            type: 'number',
        }
        const reportError = vi.spyOn(dialogService, 'error')

        render(<ConfigValueEditor entry={entry} onChange={vi.fn()} value={30000} />)

        expect(reportError).toHaveBeenCalledWith('Slider config entry react.autoCommitDelayMs requires min and max')
        expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    })

    it('renders unmarked number entries as number fields', () => {
        const entry: ConfigEntry = {
            defaultValue: 30000,
            description: 'Delay before editor changes are committed after typing stops.',
            editable: true,
            key: 'react.autoCommitDelayMs',
            label: 'Auto commit delay',
            max: 120000,
            min: 1000,
            section: 'react',
            source: 'react',
            type: 'number',
        }
        const handleChange = vi.fn()

        render(<ConfigValueEditor entry={entry} onChange={handleChange} value={30000} />)

        expect(screen.getByRole('spinbutton', { name: 'Auto commit delay' })).toBeInTheDocument()
        expect(screen.getByRole('spinbutton', { name: 'Auto commit delay' })).toHaveAccessibleDescription(entry.description)
    })

    it('associates select labels and descriptions with an outlined field', () => {
        const entry: ConfigEntry = {
            defaultValue: 'auto',
            description: 'Push commits automatically or wait for an explicit push.',
            editable: true,
            key: 'project.pushMode',
            label: 'Push mode',
            options: [
                { label: 'Auto push', value: 'auto' },
                { label: 'Manual push', value: 'manual' },
            ],
            section: 'project',
            source: 'project',
            type: 'select',
        }
        const handleChange = vi.fn()

        render(<ConfigValueEditor entry={entry} onChange={handleChange} value="auto" />)

        const select = screen.getByRole('combobox', { name: 'Push mode' })
        expect(select).toHaveAccessibleDescription(entry.description)
        expect(select.closest('.MuiOutlinedInput-root')).toBeInTheDocument()
    })

    it('renders slider entries with configured bounds and updates draft value', () => {
        const entry: ConfigEntry = {
            defaultValue: 30000,
            description: 'Delay before editor changes are committed after typing stops.',
            editable: true,
            input: 'slider',
            key: 'react.autoCommitDelayMs',
            label: 'Auto commit delay',
            max: 120000,
            min: 1000,
            section: 'react',
            source: 'react',
            step: 1000,
            type: 'number',
        }
        const handleChange = vi.fn()

        render(<ConfigValueEditor entry={entry} onChange={handleChange} value={30000} />)
        const slider = screen.getByRole('slider', { name: 'Auto commit delay' })
        fireEvent.change(slider, { target: { value: '5000' } })

        expect(slider).toHaveAttribute('aria-valuemax', '120000')
        expect(slider).toHaveAttribute('aria-valuemin', '1000')
        expect(handleChange).toHaveBeenCalledWith('react.autoCommitDelayMs', 5000)
    })

    it('renders placeholder tokens as code in helper text', () => {
        const entry: ConfigEntry = {
            defaultValue: 'git show {{commit}}',
            description: 'Command template using {{commit}} and {{file}}.',
            editable: true,
            key: 'project.diffCommand',
            label: 'Diff command',
            section: 'project',
            source: 'project',
            type: 'string',
        }

        render(<ConfigValueEditor entry={entry} onChange={vi.fn()} value="git show {{commit}}" />)

        expect(screen.getByText('{{commit}}').tagName).toBe('CODE')
        expect(screen.getByText('{{file}}').tagName).toBe('CODE')
    })

    it('renders diagram footer as multiline Markdown input', () => {
        const entry: ConfigEntry = {
            defaultValue: 'Save to {{diagram-file}}.',
            description: 'Required placeholder: {{diagram-file}}.',
            editable: true,
            input: 'multiline',
            key: 'project.diagramFooter',
            label: 'Diagram footer',
            section: 'project',
            source: 'project',
            type: 'string',
        }

        render(<ConfigValueEditor entry={entry} onChange={vi.fn()} value="Save to {{diagram-file}}." />)

        expect(screen.getByRole('textbox', { name: 'Diagram footer' })).toHaveAttribute('rows', '6')
    })

    it('keeps unavailable remembered desktop values visible with validation error', () => {
        const selection = {
            activeAgent: 'removed-agent',
            permissionMode: 'ask-for-approval' as const,
            settingsByAgent: { 'removed-agent': { model: 'removed-model', thinkingLevel: 'high' as const } },
        }

        render(
            <ConfigValueEditor
                entry={desktopSelectionEntry}
                onChange={vi.fn()}
                value={selection}
                values={{ 'desktop.agentProfiles': [], 'desktop.agentSelection': selection }}
            />,
        )

        expect(screen.getByLabelText('Agent')).toHaveTextContent('removed-agent — unavailable')
        expect(screen.getByLabelText('Model')).toHaveTextContent('removed-model — unavailable')
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('high — unavailable')
        expect(screen.getByText('Unknown agent profile in desktop agent selection: removed-agent')).toBeInTheDocument()
    })
})
