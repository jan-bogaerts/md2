import { defaultUrlTransform } from 'react-markdown'
import { isLocalFileLink } from './action_conversation_link_navigation'

/** Preserve local repository hrefs while retaining React Markdown's normal URL safety transform. */
export function actionConversationUrlTransform(url: string) {
    return isLocalFileLink(url) ? url : defaultUrlTransform(url)
}
