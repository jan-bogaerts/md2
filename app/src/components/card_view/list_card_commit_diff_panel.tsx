import { Box } from '@mui/material'
import { useSyncExternalStore, type ReactNode } from 'react'
import { CardCommitDiffPanel } from './card_commit_diff_panel'
import { listCardCommitDiffDataSource } from './list_card_commit_diff_data_source'

interface ListCardCommitDiffPanelProps {
    children: ReactNode
}

/** Locally switches between the lifetime list-card editor and its selected commit diff. */
export function ListCardCommitDiffPanel(props: ListCardCommitDiffPanelProps) {
    const { children } = props
    const selection = useSyncExternalStore(
        listCardCommitDiffDataSource.subscribe,
        listCardCommitDiffDataSource.getSnapshot,
        listCardCommitDiffDataSource.getSnapshot,
    )

    return (
        <>
            {selection ? (
                <CardCommitDiffPanel
                    binding="list-card"
                    key={selection.commit.commit}
                    onExit={listCardCommitDiffDataSource.clear}
                    selection={{ commit: selection.commit, kind: 'commit' }}
                />
            ) : null}
            <Box
                hidden={!!selection}
                sx={{ display: selection ? 'none' : 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
            >
                {children}
            </Box>
        </>
    )
}
