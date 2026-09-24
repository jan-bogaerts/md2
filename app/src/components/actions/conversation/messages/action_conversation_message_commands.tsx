import CallSplitOutlined from '@mui/icons-material/CallSplitOutlined'
import SaveOutlined from '@mui/icons-material/SaveOutlined'
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react'
import type { AgentConversation, AgentConversationMessageEntry } from '../../../../data/data_types'
import { dialogService } from '../../../../services/dialog_service'
import { useProjectReadOnly } from '../../../hooks/use_project_read_only'
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service'
import { firstPromptMessageId } from '../state/action_conversation_command_service'
import { ActionConversationCopyButton } from './action_conversation_copy_button'

interface ActionConversationMessageCommandsProps {
    commands: ActionConversationCommandOperations
    conversation: AgentConversation
    message: AgentConversationMessageEntry
}

/** Message Copy, Split, and Save controls with one-command-at-a-time mutation handling. */
export function ActionConversationMessageCommands(
    { commands, conversation, message }: ActionConversationMessageCommandsProps,
) {
    const readOnly = useProjectReadOnly()
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [label, setLabel] = useState('')
    const [pending, setPending] = useState(false)
    const firstPrompt = message.id === firstPromptMessageId(conversation)
    const splitDisabled = readOnly || pending || conversation.status === 'running'
    const saveDisabled = readOnly || pending
    const handleMenuOpen = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)
    const handleMenuClose = () => setMenuAnchor(null)
    const handleDialogClose = () => setDialogOpen(false)
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)
    const handleNewAction = () => {
        handleMenuClose()
        setDialogOpen(true)
    }
    const handleMutation = async (operation: () => Promise<void>, fallbackMessage: string) => {
        if (pending) return
        setPending(true)
        try {
            await operation()
        } catch (error) {
            dialogService.error(error, { fallbackMessage })
        } finally {
            setPending(false)
        }
    }
    const handleSplit = async () => handleMutation(
        () => commands.split(conversation, message),
        'Could not split conversation',
    )
    const handleResponsePhrase = async () => {
        handleMenuClose()
        await handleMutation(() => commands.saveAsResponsePhrase(message), 'Could not save response phrase')
    }
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (label.trim().length === 0) return
        await handleMutation(async () => {
            await commands.saveAsNewAction(message, label.trim())
            setDialogOpen(false)
            setLabel('')
        }, 'Could not save message as new action')
    }

    return (
        <>
            <Stack
                aria-label="Message commands"
                direction="row"
                sx={{
                    alignItems: 'center',
                    height: 28,
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                    opacity: 0,
                    transition: (theme) => theme.transitions.create('opacity'),
                    '@media (hover: none)': { opacity: 1 },
                    '.conversation-message:hover &': { opacity: 1 },
                    '.conversation-message:focus-within &': { opacity: 1 },
                }}
            >
                <ActionConversationCopyButton label="Copy message" text={message.content} />
                <Tooltip title="Split conversation here">
                    <span>
                        <IconButton aria-label="Split conversation here" disabled={splitDisabled} onClick={handleSplit} size="small"
                            sx={{ height: 28, width: 28 }}>
                            <CallSplitOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Save message">
                    <span>
                        <IconButton aria-label="Save message" disabled={saveDisabled} onClick={handleMenuOpen} size="small"
                            sx={{ height: 28, width: 28 }}>
                            <SaveOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            <Menu anchorEl={menuAnchor} onClose={handleMenuClose} open={!!menuAnchor}>
                <MenuItem disabled={pending || readOnly} onClick={handleNewAction}>Save as new action</MenuItem>
                {!firstPrompt ? (
                    <MenuItem disabled={pending || readOnly || !commands.canSaveResponsePhrase()} onClick={handleResponsePhrase}>
                        Save as response phrase
                    </MenuItem>
                ) : null}
            </Menu>
            <Dialog fullWidth maxWidth="sm" onClose={pending ? undefined : handleDialogClose} open={dialogOpen}>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogTitle>Save message as new action</DialogTitle>
                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <Box>
                            <Typography color="text.secondary" variant="caption">Action label</Typography>
                            <TextField autoFocus disabled={pending} fullWidth onChange={handleLabelChange} required size="small" value={label} />
                        </Box>
                        <Box>
                            <Typography color="text.secondary" variant="caption">Selected message</Typography>
                            <Box component="pre" sx={{
                                bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1,
                                m: 0, maxHeight: 240, overflow: 'auto', overflowWrap: 'anywhere', p: 1, whiteSpace: 'pre-wrap',
                            }}>
                                {message.content}
                            </Box>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleDialogClose} variant="outlined">Cancel</Button>
                        <Button disabled={pending || label.trim().length === 0} type="submit" variant="contained">Save</Button>
                    </DialogActions>
                </Box>
            </Dialog>
        </>
    )
}
