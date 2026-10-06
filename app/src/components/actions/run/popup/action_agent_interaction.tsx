import type { ActionContext } from '../../../../data/action_context';
import type { ActionDefinition } from '../../../../data/action_types';
import { AgentAction } from './agent_action';
import type { ActionPopupRuntime } from './action_popup_types';

interface ActionAgentInteractionProps {
    action: ActionDefinition;
    assignmentContext: ActionContext;
    baseContext: ActionContext;
    runtime: ActionPopupRuntime;
}

/** Command-started agent children reuse the complete agent conversation/input layout. */
export function ActionAgentInteraction(props: ActionAgentInteractionProps) {
    return <AgentAction {...props} readOnlyMessage={null} />;
}
