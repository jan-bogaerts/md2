import { Box, Stack, Typography } from '@mui/material'
import type { ConfigEntry, ConfigKey } from '../../services/config/config_service'
import type { ConfigSectionProps } from './config_section_props'
import { ConfigSubsection } from './config_subsection'
import { ConfigValueEditor } from './config_value_editor'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeConfigList } from './worktree_config_list'

const CONFIG_SECTION_SCROLL_MARGIN_TOP = 3
const PROJECT_CONFIG_SECTION_ID = 'project'
const PROJECT_CONFIG_SECTION_LABEL = 'Project'

interface ProjectConfigGroup {
    description: string
    id: string
    keys: ConfigKey[]
    label: string
}

const PROJECT_CONFIG_GROUPS: ProjectConfigGroup[] = [
    {
        description: 'Where MD² reads and writes this project\'s files. Every folder except the project folder is relative to it.',
        id: 'project-folders',
        keys: [
            'project.projectFolder',
            'project.workingFolder',
            'project.actionsFolder',
            'project.releasesFolder',
            'project.diagramsFolder',
            'project.archivedFolder',
        ],
        label: 'Folders',
    },
    {
        description: 'How cards are named on disk, which card types exist, and which board columns they move through.',
        id: 'project-cards',
        keys: ['project.cardSeparator', 'project.cardTypes', 'project.states'],
        label: 'Cards',
    },
    {
        description: 'How MD² talks to Git for this project.',
        id: 'project-git',
        keys: ['project.diffCommand', 'project.pushMode'],
        label: 'Git',
    },
    {
        description: 'How this project window looks, so parallel projects stay apart.',
        id: 'project-appearance',
        keys: ['project.backgroundShade'],
        label: 'Appearance',
    },
    {
        description: 'Markdown appended to every diagram action prompt.',
        id: 'project-diagrams',
        keys: ['project.diagramFooter'],
        label: 'Diagrams',
    },
]

const GROUPED_PROJECT_CONFIG_KEYS = new Set<ConfigKey>(PROJECT_CONFIG_GROUPS.flatMap((group) => group.keys))

interface ProjectConfigSectionProps extends ConfigSectionProps {
    disabled?: boolean
}

export function ProjectConfigSection(props: ProjectConfigSectionProps) {
    const { disabled = false, draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === PROJECT_CONFIG_SECTION_ID)
    const ungroupedEntries = sectionEntries.filter((entry) => entry.editable && !GROUPED_PROJECT_CONFIG_KEYS.has(entry.key))
    const headingId = `${PROJECT_CONFIG_SECTION_ID}-config-heading`

    const renderEntry = (entry: ConfigEntry) => (
        <ConfigValueEditor
            disabled={disabled}
            entry={entry}
            key={entry.key}
            onChange={onChange}
            onValidityChange={onValidityChange}
            value={draft[entry.key]}
            values={draft}
        />
    )

    return (
        <>
            <Box
                aria-labelledby={headingId}
                component="section"
                id={PROJECT_CONFIG_SECTION_ID}
                sx={{ scrollMarginTop: CONFIG_SECTION_SCROLL_MARGIN_TOP }}
            >
                <Stack spacing={4}>
                    <Typography component="h3" id={headingId} variant="h6">
                        {PROJECT_CONFIG_SECTION_LABEL}
                    </Typography>
                    {PROJECT_CONFIG_GROUPS.map((group) => {
                        const groupEntries = group.keys
                            .map((key) => sectionEntries.find((entry) => entry.key === key))
                            .filter((entry): entry is ConfigEntry => !!entry)
                        if (groupEntries.length === 0) return null

                        return (
                            <ConfigSubsection description={group.description} id={group.id} key={group.id} label={group.label}>
                                {groupEntries.map(renderEntry)}
                            </ConfigSubsection>
                        )
                    })}
                    {ungroupedEntries.length > 0 ? (
                        <Stack spacing={3}>
                            {ungroupedEntries.map(renderEntry)}
                        </Stack>
                    ) : null}
                </Stack>
            </Box>
            {worktreeService.isSupported() && !disabled ? <WorktreeConfigList /> : null}
        </>
    )
}
