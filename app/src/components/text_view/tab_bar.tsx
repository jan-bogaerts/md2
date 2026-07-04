import { Box, IconButton, Tab, Tabs } from '@mui/material'
import Close from 'mdi-material-ui/Close'
import type { SyntheticEvent } from 'react'

export interface OpenTab {
    label: string
    path: string
}

interface TabBarProps {
    activePath: string | null
    onActivate: (path: string) => void
    onClose: (path: string) => void
    tabs: OpenTab[]
}

/** Horizontal bar of open-file tabs with per-tab close buttons. */
export function TabBar(props: TabBarProps) {
    const { activePath, onActivate, onClose, tabs } = props

    const handleChange = (_event: SyntheticEvent, value: string) => {
        onActivate(value)
    }

    return (
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
                onChange={handleChange}
                scrollButtons="auto"
                value={activePath ?? false}
                variant="scrollable"
            >
                {tabs.map((tab) => (
                    <Tab
                        key={tab.path}
                        component="div"
                        label={(
                            <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
                                <span>{tab.label}</span>
                                <IconButton
                                    aria-label={`Close ${tab.label}`}
                                    component="span"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onClose(tab.path)
                                    }}
                                    size="small"
                                >
                                    <Close fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                        value={tab.path}
                    />
                ))}
            </Tabs>
        </Box>
    )
}
