import { useEffect, useState } from 'react'
import { actionService, type ActionService, type ActionServiceState } from '../../services/actions/action_service'

function getChangedState(event: Event): ActionServiceState {
    return (event as CustomEvent<ActionServiceState>).detail
}

/** Subscribe to the loaded action definitions exposed by the action service. */
export function useActions(service: ActionService = actionService): ActionServiceState {
    const [state, setState] = useState(service.getState())

    useEffect(() => {
        const handleChanged = (event: Event) => {
            setState(getChangedState(event))
        }

        service.addEventListener('changed', handleChanged)

        return () => {
            service.removeEventListener('changed', handleChanged)
        }
    }, [service])

    return state
}
