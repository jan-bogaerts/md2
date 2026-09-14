import { IconButton, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material'
import TrashCanOutline from 'mdi-material-ui/TrashCanOutline'
import type { MouseEvent } from 'react'

interface RecentProjectFolderListProps {
    isLoading: boolean
    paths: string[]
    onOpen: (rootPath: string) => Promise<void>
    onRemove: (rootPath: string) => Promise<void>
    onSelect: (rootPath: string) => void
}

function requireRootPath(element: HTMLElement) {
    const rootPath = element.dataset.rootPath
    if (!rootPath) throw new Error('Recent local repository path is missing')

    return rootPath
}

/** Recent local project folders with separate selection and removal controls. */
export function RecentProjectFolderList(props: RecentProjectFolderListProps) {
    const { isLoading, onOpen, onRemove, onSelect, paths } = props

    const handleSelect = (event: MouseEvent<HTMLDivElement>) => {
        onSelect(requireRootPath(event.currentTarget))
    }

    const handleOpen = (event: MouseEvent<HTMLDivElement>) => {
        if (isLoading) return

        void onOpen(requireRootPath(event.currentTarget))
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        void onRemove(requireRootPath(event.currentTarget))
    }

    return (
        <>
            <Typography variant="subtitle2">Recent folders</Typography>
            <List dense disablePadding>
                {paths.map((rootPath) => (
                    <ListItem
                        disablePadding
                        key={rootPath.toLowerCase()}
                        sx={{
                            alignItems: 'center',
                            display: 'flex',
                            '& .recent-folder-remove': { opacity: 0 },
                            '&:focus-within .recent-folder-remove, &:hover .recent-folder-remove': { opacity: 1 },
                        }}
                    >
                        <ListItemButton
                            data-root-path={rootPath}
                            onClick={handleSelect}
                            onDoubleClick={handleOpen}
                            sx={{ flex: 1, minWidth: 0 }}
                        >
                            <ListItemText primary={rootPath} />
                        </ListItemButton>
                        <Tooltip title={`Remove ${rootPath} from recent folders`}>
                            <IconButton
                                aria-label={`Remove ${rootPath} from recent folders`}
                                className="recent-folder-remove"
                                data-root-path={rootPath}
                                onClick={handleRemove}
                                size="small"
                                sx={{ flexShrink: 0, width: 40 }}
                            >
                                <TrashCanOutline fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </ListItem>
                ))}
            </List>
        </>
    )
}
