import { useContext, type ComponentProps, type MouseEvent } from 'react'
import { dialogService } from '../../../../services/dialog_service'
import { isLocalFileLink, openActionConversationLink } from './action_conversation_link_navigation'
import { ActionConversationLinkContext } from './action_conversation_link_context'
import { INVALID_LOCAL_FILE_LINK_ERROR, isLocalFileLinkError } from '../../../../../../shared/local_file_link_errors.mjs'

type ActionConversationLinkProps = ComponentProps<'a'>

function isExternalWebLink(href: string) {
    return /^https?:\/\//iu.test(href) || href.startsWith('//')
}

/** Show expected link validation failures without telemetry; report everything else. */
function reportLinkOpenFailure(error: unknown, href: string) {
    if (isLocalFileLinkError(error, INVALID_LOCAL_FILE_LINK_ERROR)) {
        dialogService.displayError(error.message)
        return
    }

    dialogService.error(error, { fallbackMessage: `Local file link could not be opened: ${href}` })
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
        void openActionConversationLink(href, cardInternalId).catch((error: unknown) => reportLinkOpenFailure(error, href))
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
