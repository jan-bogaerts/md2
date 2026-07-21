import { Box, Typography } from '@mui/material'
import type { ActionDefinition } from '../../data/action_types'
import type { CardTypeConfig } from '../../data/data_types'
import { ListActionEditor } from '../actions/list_action_editor'
import { useOpenFiles } from '../hooks/use_open_files'
import { CardEditor } from './card_editor'
import { TabBar } from './tab_bar'

interface TextEditorPaneProps {
    actions: ActionDefinition[]
    actionsFolder: string
    cardTypes: CardTypeConfig[]
    markdownDocumentNamespace: string
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
    statusColors: Map<string, string>
    visible: boolean
}

/** Layout for the service-owned active document and its lifetime-stable editors. */
export function TextEditorPane(props: TextEditorPaneProps) {
    const {
        actions, actionsFolder, cardTypes, markdownDocumentNamespace, repositoryFiles,
        specialContextTypes, states, statusColors, visible,
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
                        actions={actions}
                        cardTypes={cardTypes.map(({ type }) => type)}
                        markdownDocumentNamespace={markdownDocumentNamespace}
                        repositoryFiles={repositoryFiles}
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
                        <CardEditor cardTypes={cardTypes} statusColors={statusColors} visible={visible} />
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}
