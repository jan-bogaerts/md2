import { type ComponentProps, type MouseEvent } from 'react'
import { dialogService } from '../../services/dialog_service'
import { isLocalFileLink, openActionConversationLink } from './action_conversation_link_navigation'

type ActionConversationLinkProps = ComponentProps<'a'>

/** Markdown anchor that routes local repository files without browser navigation. */
export function ActionConversationLink(props: ActionConversationLinkProps) {
    const { href, onClick, ...anchorProps } = props

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented || !href || !isLocalFileLink(href)) return

        event.preventDefault()
        void openActionConversationLink(href).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: `Local file link could not be opened: ${href}` })
        })
    }

    return <a {...anchorProps} href={href} onClick={handleClick} />
}
