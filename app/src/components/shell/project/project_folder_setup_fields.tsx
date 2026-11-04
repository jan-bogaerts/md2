import { Autocomplete, Box, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import type { AutocompleteRenderInputParams } from '@mui/material'
import { FolderOpen } from 'mdi-material-ui'
import type { MouseEvent, SyntheticEvent } from 'react'
import { DEFAULT_PROJECT_CONFIG } from '../../../data/data_types'
import {
    resolvedSetupFolders,
    type ProjectFolderSetupResolution,
    type ProjectFolderValues,
} from '../../../services/project/project_session_service'
import { ConfigSubsection } from '../../config/config_subsection'

type FolderField = keyof ProjectFolderValues
type FolderGroup = 'current' | 'history' | 'root'

interface FolderFieldDescriptor {
    description: string
    field: FolderField
    group: FolderGroup
    label: string
}

interface FolderGroupDescriptor {
    description: string
    group: FolderGroup
    id: string
    title: string
}

interface ProjectFolderSetupFieldsProps {
    isLoading: boolean
    resolution: ProjectFolderSetupResolution
    values: ProjectFolderValues
    onBrowseFolder: ((field: FolderField) => void) | null
    onValuesChange: (values: ProjectFolderValues) => void
}

const FOLDER_FIELDS: FolderFieldDescriptor[] = [
    {
        description: 'Contains the MD² project configuration and all project subfolders.',
        field: 'projectFolder',
        group: 'root',
        label: 'Project folder',
    },
    {
        description: 'Contains active design and job Markdown files that MD² loads as cards.',
        field: 'workingFolder',
        group: 'current',
        label: 'Working folder',
    },
    {
        description: 'Contains JSON diagram data saved by diagram actions.',
        field: 'diagramsFolder',
        group: 'current',
        label: 'Diagrams folder',
    },
    {
        description: 'Contains JSON definitions for project actions.',
        field: 'actionsFolder',
        group: 'current',
        label: 'Actions folder',
    },
    {
        description: 'Contains one subfolder for each completed release.',
        field: 'releasesFolder',
        group: 'history',
        label: 'Releases folder',
    },
    {
        description: 'Contains cards archived individually outside a release.',
        field: 'archivedFolder',
        group: 'history',
        label: 'Archived folder',
    },
]

const FOLDER_GROUPS: FolderGroupDescriptor[] = [
    {
        description: 'Choose the top-level repository folder that contains this MD² project.',
        group: 'root',
        id: 'project-folder-setup-root',
        title: 'Project folder',
    },
    {
        description: 'These folders contain files MD² reads or writes while work on the project is active.',
        group: 'current',
        id: 'project-folder-setup-current',
        title: 'Current project files',
    },
    {
        description: 'These folders contain completed releases and cards archived outside a release.',
        group: 'history',
        id: 'project-folder-setup-history',
        title: 'History',
    },
]

/** Resolved repository path of one field, so the form can show what will be created. */
function resolvedFolderPath(values: ProjectFolderValues, field: FolderField) {
    const config = { ...DEFAULT_PROJECT_CONFIG, ...values }
    if (field === 'projectFolder') return values.projectFolder.trim()

    const [workingFolder, archivedFolder, actionsFolder, releasesFolder, diagramsFolder] = resolvedSetupFolders(config)
    if (field === 'workingFolder') return workingFolder
    if (field === 'archivedFolder') return archivedFolder
    if (field === 'actionsFolder') return actionsFolder
    if (field === 'diagramsFolder') return diagramsFolder

    return releasesFolder
}

/** Six editable folder fields grouped into project, current-file, and history cards. */
export function ProjectFolderSetupFields(props: ProjectFolderSetupFieldsProps) {
    const { isLoading, onBrowseFolder, onValuesChange, resolution, values } = props
    const existingFolders = new Set(resolution.existingFolderPaths)
    const topLevelFolderOptions = resolution.folders.map(({ path }) => path)
    const projectFolderPrefix = `${values.projectFolder.trim().replace(/\/+$/u, '')}/`
    const subFolderOptions = resolution.existingFolderPaths
        .filter((folderPath) => folderPath.startsWith(projectFolderPrefix))
        .map((folderPath) => folderPath.slice(projectFolderPrefix.length))

    const handleBrowseClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (!onBrowseFolder) return

        onBrowseFolder(event.currentTarget.value as FolderField)
    }

    const renderFolderInput = (descriptor: FolderFieldDescriptor) => {
        function renderInput(params: AutocompleteRenderInputParams) {
            return (
                <TextField
                    {...params}
                    fullWidth
                    helperText={descriptor.description}
                    size="small"
                    slotProps={{
                        ...params.slotProps,
                        htmlInput: { ...params.slotProps.htmlInput, 'aria-label': descriptor.label },
                        input: {
                            ...params.slotProps.input,
                            endAdornment: onBrowseFolder ? (
                                <InputAdornment position="end">
                                    <Tooltip title={`Choose ${descriptor.label.toLowerCase()}`}>
                                        <span>
                                            <IconButton
                                                aria-label={`Choose ${descriptor.label.toLowerCase()}`}
                                                disabled={isLoading}
                                                edge="end"
                                                onClick={handleBrowseClick}
                                                value={descriptor.field}
                                            >
                                                <FolderOpen />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </InputAdornment>
                            ) : params.slotProps.input.endAdornment,
                        },
                    }}
                    variant="outlined"
                />
            )
        }

        return renderInput
    }

    /** One label-above-control folder row, with its resolved path and a marker when that path is missing. */
    const renderFolderRow = (descriptor: FolderFieldDescriptor) => {
        const resolvedPath = resolvedFolderPath(values, descriptor.field)
        const isMissing = resolvedPath.length > 0 && !existingFolders.has(resolvedPath)
        const isRoot = descriptor.group === 'root'
        const handleInputChange = (_event: SyntheticEvent, value: string) => {
            onValuesChange({ ...values, [descriptor.field]: value })
        }

        return (
            <Stack data-folder-row={descriptor.field} key={descriptor.field} spacing={0.125}>
                <Typography
                    sx={{
                        color: isRoot ? 'text.primary' : 'text.secondary',
                        fontSize: 12,
                        fontWeight: isRoot ? 700 : 600,
                    }}
                >
                    {descriptor.label}
                </Typography>
                <Autocomplete
                    disabled={isLoading}
                    freeSolo
                    inputValue={values[descriptor.field]}
                    onInputChange={handleInputChange}
                    options={isRoot ? topLevelFolderOptions : subFolderOptions}
                    renderInput={renderFolderInput(descriptor)}
                />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, pt: 0.25 }}>
                    <Typography
                        sx={{
                            color: 'custom.text3',
                            flex: 1,
                            fontSize: 12,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {`Resolved path: ${resolvedPath}`}
                    </Typography>
                    {isMissing ? (
                        <Box
                            sx={{
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: '9px',
                                color: 'custom.text3',
                                flexShrink: 0,
                                fontSize: 11,
                                px: 0.75,
                            }}
                        >
                            Will be created
                        </Box>
                    ) : null}
                </Stack>
            </Stack>
        )
    }

    return (
        <Stack spacing={2}>
            <Typography variant="body2">
                {resolution.hasProjectConfig
                    ? 'Check where this project keeps its folders. Missing folders are created when you confirm.'
                    : 'Choose where MD² should keep this project. Missing folders are created when you confirm.'}
            </Typography>
            {FOLDER_GROUPS.map(({ description, group, id, title }) => (
                <ConfigSubsection description={description} id={id} key={group} label={title}>
                    {FOLDER_FIELDS.filter((descriptor) => descriptor.group === group).map(renderFolderRow)}
                </ConfigSubsection>
            ))}
        </Stack>
    )
}
