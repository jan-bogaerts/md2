import { Box } from '@mui/material';
import { Children, isValidElement, type ComponentProps } from 'react';
import { ActionConversationCopyButton } from './action_conversation_copy_button';

const COPY_CONTROL_SPACE = 4.5;

/** Renders Markdown block code with a separate, whitespace-preserving copy control. */
export function ActionConversationCodeBlock({ children }: ComponentProps<'pre'>) {
    const text = Children.toArray(children)
        .filter(isValidElement<{ children: string }>)
        .filter((element) => element.type === 'code')
        .map(({ props }) => props.children)
        .join('');

    return (
        <Box className="conversation-code-block" sx={{ minWidth: 0, position: 'relative', pr: COPY_CONTROL_SPACE }}>
            <Box component="pre" sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                boxSizing: 'border-box',
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                p: 1,
                whiteSpace: 'pre-wrap',
                width: '100%',
            }}>
                {children}
            </Box>
            <Box sx={{
                opacity: 0,
                position: 'absolute',
                right: 0,
                top: 0,
                transition: (theme) => theme.transitions.create('opacity'),
                '@media (hover: none)': { opacity: 1 },
                '.conversation-code-block:hover > &': { opacity: 1 },
                '.conversation-code-block:focus-within > &': { opacity: 1 },
            }}>
                <ActionConversationCopyButton label="Copy code block" text={text} />
            </Box>
        </Box>
    );
}
