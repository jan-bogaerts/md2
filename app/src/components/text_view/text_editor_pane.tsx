import { Box, Typography } from '@mui/material'
import type { CardTypeConfig } from '../../data/data_types'
import { ListActionEditor } from '../actions/editor/list_action_editor'
import { useOpenFiles } from '../hooks/use_open_files'
import { CardEditor } from './card_editor'
import { TabBar } from './tab_bar'

interface TextEditorPaneProps {
    actionsFolder: string
    cardTypes: CardTypeConfig[]
    specialContextTypes: string[]
    states: string[]
    statusColors: Map<string, string>
}

/** Layout for the service-owned active document and its lifetime-stable editors. */
export function TextEditorPane(props: TextEditorPaneProps) {
    const {
        actionsFolder, cardTypes,
        specialContextTypes, states, statusColors,
    } = props
    const { activeDocument } = useOpenFiles()
    const hasActiveAction = activeDocument?.kind === 'action'
    const hasActiveCard = activeDocument?.kind === 'card'
    const hasActiveDocument = hasActiveAction || hasActiveCard

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
            <TabBar actionsFolder={actionsFolder} cardTypes={cardTypes} />
            <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                <Box
                    data-testid="editor-content-pane"
                    sx={{
                        alignItems: hasActiveDocument ? undefined : 'center',
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        justifyContent: hasActiveCard ? undefined : 'center',
                        minHeight: 0,
                        overflow: hasActiveAction ? 'hidden' : 'auto',
                        p: hasActiveDocument ? 0 : 2,
                    }}
                >
                    <ListActionEditor
                        cardTypes={cardTypes.map(({ type }) => type)}
                        specialContextTypes={specialContextTypes}
                        states={states}
                    />
                    {!hasActiveDocument ? (
                        <Typography color="text.secondary" variant="body2">
                            Select a file from the tree to open it.
                        </Typography>
                    ) : null}
                    <Box
                        hidden={!hasActiveCard}
                        sx={{ display: hasActiveCard ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}
                    >
                        <CardEditor cardTypes={cardTypes} statusColors={statusColors} />
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}
