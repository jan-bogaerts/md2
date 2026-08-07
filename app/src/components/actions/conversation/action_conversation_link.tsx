import { useContext, type ComponentProps, type MouseEvent } from 'react'
import { dialogService } from '../../../services/dialog_service'
import { isLocalFileLink, openActionConversationLink } from './action_conversation_link_navigation'
import { ActionConversationLinkContext } from './action_conversation_link_context'

type ActionConversationLinkProps = ComponentProps<'a'>

function isExternalWebLink(href: string) {
    return /^https?:\/\//iu.test(href) || href.startsWith('//')
}

/** Markdown anchor that routes local repository files without browser navigation. */
export function ActionConversationLink(props: ActionConversationLinkProps) {
    const { href, onClick, rel, target, ...anchorProps } = props
    const opensOutsideRenderer = !!href && isExternalWebLink(href)
    const cardInternalId = useContext(ActionConversationLinkContext)

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented || !href || !isLocalFileLink(href)) return

        event.preventDefault()
        event.stopPropagation()
        void openActionConversationLink(href, cardInternalId).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: `Local file link could not be opened: ${href}` })
        })
    }

    return (
        <a
            {...anchorProps}
            href={href}
            onClick={handleClick}
            rel={opensOutsideRenderer ? 'noopener noreferrer' : rel}
            target={opensOutsideRenderer ? '_blank' : target}
        />
    )
}
