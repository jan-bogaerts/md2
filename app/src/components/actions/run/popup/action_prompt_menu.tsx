import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import CompressOutlined from '@mui/icons-material/CompressOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type MouseEvent } from 'react';
import type { ActionContext } from '../../../../data/action_context';
import { generateUuid } from '../../../../data/uuid';
import { actionCompactService } from '../../../../services/actions/action_compact_service';
import type { ActionPromptDraft } from '../../../../services/actions/action_prompt_draft_service';
import { attachFilesToCardMarkdown, attachFilesToOriginalMarkdown } from '../../../../services/attachments/attachment_workflow';
import { dialogService } from '../../../../services/dialog_service';
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs';
import { resolveDisplayedConversation, type ActionConversationStore } from '../../conversation/state/action_conversation_store';
import type { ActionRunBindingStore } from '../state/action_run_binding_store';

interface ActionPromptMenuProps {
    actionId: string;
    bindingStore: ActionRunBindingStore;
    context: ActionContext;
    conversationStore: ActionConversationStore;
    promptDraft: ActionPromptDraft;
}

/** Owns prompt menu interaction, attachment picking, and captured compact targets. */
export function ActionPromptMenu({ actionId, bindingStore, context, conversationStore, promptDraft }: ActionPromptMenuProps) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);
    const boundRunId = useBoundRunId(bindingStore);
    const liveConversation = useRunSelector(boundRunId, (run) => run?.conversation ?? null);
    const liveProvider = useRunSelector(boundRunId, (run) => run?.agentProvider ?? null);
    const conversations = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot, conversationStore.getSnapshot);
    const editor = useSyncExternalStore(promptDraft.subscribeEditor, promptDraft.getEditorSnapshot, promptDraft.getEditorSnapshot);
    const displayed = resolveDisplayedConversation(liveConversation, conversations.selectedConversation);
    const conversationId = displayed?.id ?? null;
    const subscribe = useCallback((listener: () => void) => {
        const eventType = `compact:${conversationId}`;
        actionCompactService.addEventListener(eventType, listener);
        return () => actionCompactService.removeEventListener(eventType, listener);
    }, [conversationId]);
    const getSnapshot = useCallback(() => actionCompactService.getSnapshot(conversationId), [conversationId]);
    const requests = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const latestRequest = requests.at(-1);
    const compactStatus = latestRequest ? `Compact ${latestRequest.state}${latestRequest.message ? `: ${latestRequest.message}` : ''}` : null;
    const openMenu = (event: MouseEvent<HTMLButtonElement>) => setAnchor(event.currentTarget);
    const closeMenu = () => setAnchor(null);
    const openFiles = () => {
        closeMenu();
        fileInput.current?.click();
    };
    const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length === 0) return;
        try {
            if (context.file) await attachFilesToCardMarkdown(context.file, files, promptDraft.requestInsertion);
            else await attachFilesToOriginalMarkdown(files, promptDraft.requestInsertion);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Files could not be attached' });
        }
    };
    const compact = async () => {
        closeMenu();
        try {
            if (!displayed || !displayed.entries.some(({ kind }) => kind === 'message')) throw new Error('There is nothing to compact');
            const session = displayed.providerSessions.reduce<typeof displayed.providerSessions[number] | null>(
                (latest, candidate) => !latest || candidate.lastUsedAt > latest.lastUsedAt ? candidate : latest, null,
            );
            const provider = displayed.id === liveConversation?.id ? liveProvider ?? session?.agent : session?.agent;
            if (!provider) throw new Error('Missing provider session for compact');
            const request = {
                actionId, context: { ...context }, conversationId: displayed.id, provider,
                reference: displayed.path, requestId: generateUuid(),
            };
            const accepted = await actionCompactService.request(request);
            if (mounted.current && accepted?.runId && conversationStore.getSnapshot().selectedConversation?.id === request.conversationId) {
                await conversationStore.select(request.conversationId);
            }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Compaction failed' });
        }
    };

    useEffect(() => {
        mounted.current = true;
        actionCompactService.connect();
        return () => { mounted.current = false; };
    }, []);

    return (
        <>
            <Tooltip title={compactStatus ?? 'Prompt menu'}>
                <IconButton
                    aria-expanded={!!anchor} aria-haspopup="menu" aria-label="Prompt menu"
                    onClick={openMenu} size="small" sx={{ flexShrink: 0 }}
                >
                    <MenuOutlined sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} onClose={closeMenu} open={!!anchor}>
                <MenuItem onClick={compact}>
                    <ListItemIcon><CompressOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Compact" secondary={compactStatus} />
                </MenuItem>
                <MenuItem disabled={editor.preparationStatus !== 'ready'} onClick={openFiles}>
                    <ListItemIcon><AttachFileOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Add file" />
                </MenuItem>
            </Menu>
            <input aria-label="Add files" hidden multiple onChange={handleFiles} ref={fileInput} type="file" />
            {compactStatus ? (
                <span aria-live="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
                    {compactStatus}
                </span>
            ) : null}
        </>
    );
}
