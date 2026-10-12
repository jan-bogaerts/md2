import { AgentAction } from './agent_action'
import { CommandAction } from './command_action'
import type { ActionPopupContentProps, ActionPopupRuntime } from './action_popup_types'

interface ActionPopupSessionProps extends ActionPopupContentProps {
    runtime: ActionPopupRuntime;
}

/** Renders selected bindings without an action-keyed frame or agent editor. */
export function ActionPopupSession(props: ActionPopupSessionProps) {
    const { action, assignmentContext, historicalEntries, runtime } = props;

    return (
        <>
            {action.type === 'agent'
                ? (
                    <AgentAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        popupEntryId={props.popupEntryId}
                        popupVisible={props.popupVisible}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                        showHistoricalHistory={!!historicalEntries}
                    />
                ) : (
                    <CommandAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                        showHistoricalHistory={!!historicalEntries}
                    />
                )}
        </>
    )
}
