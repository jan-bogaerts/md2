import { actionContextIdentity } from '../../../../data/action_context';
import { ActionPopupSession } from './action_popup_session';
import type { ActionPopupContentProps } from './action_popup_types';

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_frame';

/** Keep popup stores alive across assignment changes for the same action and canonical context. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const identity = `${props.action.id}\u0000${actionContextIdentity(props.assignmentContext)}`;

    return <ActionPopupSession key={identity} {...props} />;
}
