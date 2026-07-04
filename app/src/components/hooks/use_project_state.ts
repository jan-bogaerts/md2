import { useEffect, useState } from 'react'
import { dataService, type DataService, type DataServiceState } from '../../services/data_service'

function getChangedState(event: Event): DataServiceState {
    return (event as CustomEvent<DataServiceState>).detail
}

export function useProjectState(service: DataService = dataService): DataServiceState {
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
