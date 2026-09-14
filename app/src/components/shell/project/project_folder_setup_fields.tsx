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

type FolderField = keyof ProjectFolderValues
type FolderGroup = 'history' | 'live' | 'root'

interface FolderFieldDescriptor {
    field: FolderField
    group: FolderGroup
    label: string
}

interface ProjectFolderSetupFieldsProps {
    isLoading: boolean
    resolution: ProjectFolderSetupResolution
    values: ProjectFolderValues
    onBrowseFolder: ((field: FolderField) => void) | null
    onValuesChange: (values: ProjectFolderValues) => void
}

const FOLDER_FIELDS: FolderFieldDescriptor[] = [
    { field: 'projectFolder', group: 'root', label: 'Project folder' },
    { field: 'workingFolder', group: 'live', label: 'Working folder' },
    { field: 'diagramsFolder', group: 'live', label: 'Diagrams folder' },
    { field: 'actionsFolder', group: 'live', label: 'Actions folder' },
    { field: 'releasesFolder', group: 'history', label: 'Releases folder' },
    { field: 'archivedFolder', group: 'history', label: 'Archived folder' },
]

const FOLDER_GROUPS: { group: FolderGroup, title: string }[] = [
    { group: 'live', title: 'Live' },
    { group: 'history', title: 'History' },
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

/** Six editable folder fields, grouped as the project root plus its live and history sub-folders. */
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
                        {resolvedPath}
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
            {FOLDER_FIELDS.filter(({ group }) => group === 'root').map(renderFolderRow)}
            {FOLDER_GROUPS.map(({ group, title }) => (
                <Stack
                    key={group}
                    spacing={1.5}
                    sx={{ borderColor: 'divider', borderLeft: '1px solid', ml: 1, pl: 2 }}
                >
                    <Typography
                        component="h3"
                        sx={{ color: 'custom.colHead', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', lineHeight: 1.4 }}
                        variant="overline"
                    >
                        {title}
                    </Typography>
                    {FOLDER_FIELDS.filter((descriptor) => descriptor.group === group).map(renderFolderRow)}
                </Stack>
            ))}
        </Stack>
    )
}
