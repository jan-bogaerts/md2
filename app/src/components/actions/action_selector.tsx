import { Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import Plus from 'mdi-material-ui/Plus'
import type { MouseEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'

interface ActionSelectorProps {
    adding: boolean
    actions: ActionDefinition[]
    onAdd: () => void
    onSelect: (action: ActionDefinition) => void
    selectedAction: ActionDefinition
}

/** Horizontally scrollable, mutually exclusive action selector used by the card Run popup. */
export function ActionSelector(props: ActionSelectorProps) {
    const { adding, actions, onAdd, onSelect, selectedAction } = props

    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        const action = actions.find((candidate) => candidate.id === actionId)
        if (action) onSelect(action)
    }

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flex: 1, flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
                <ToggleButtonGroup
                    aria-label="Actions"
                    exclusive
                    onChange={handleChange}
                    size="small"
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        '& .MuiToggleButtonGroup-grouped': {
                            bgcolor: 'action.selected',
                            border: '1px solid transparent',
                            borderRadius: '7px !important',
                            color: 'text.secondary',
                            fontSize: 12,
                            fontWeight: 600,
                            height: 26,
                            m: '0 !important',
                            px: 1.5,
                            textTransform: 'none',
                            '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled', color: 'text.primary' },
                            '&.Mui-selected': {
                                bgcolor: 'action.selected',
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'action.selected' },
                            },
                        },
                    }}
                    value={selectedAction.id}
                >
                    {actions.map((action) => (
                        <Tooltip describeChild key={action.id} title={action.description}>
                            <ToggleButton value={action.id}>
                                {action.label}
                            </ToggleButton>
                        </Tooltip>
                    ))}
                </ToggleButtonGroup>
            </Box>
            <Tooltip title="Add action">
                <IconButton
                    aria-label="Add action"
                    onClick={onAdd}
                    size="small"
                    sx={{
                        bgcolor: adding ? 'action.selected' : 'background.paper',
                        border: 1,
                        borderColor: adding ? 'primary.main' : 'divider',
                        color: adding ? 'primary.main' : 'text.secondary',
                        height: 28,
                        width: 28,
                        '&:hover': { bgcolor: 'action.selected', borderColor: 'primary.main', color: 'primary.main' },
                    }}
                >
                    <Plus sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
