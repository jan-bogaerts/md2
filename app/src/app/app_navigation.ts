import { useEffect, useState } from 'react'

export interface AppLocation {
    hash: string
    pathname: string
}

function readLocation(): AppLocation {
    return { hash: window.location.hash, pathname: window.location.pathname }
}

export function navigateTo(path: string) {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new Event('popstate'))
}

export function useAppLocation() {
    const [location, setLocation] = useState<AppLocation>(readLocation)

    useEffect(() => {
        const handleLocationChange = () => {
            setLocation(readLocation())
        }

        window.addEventListener('hashchange', handleLocationChange)
        window.addEventListener('popstate', handleLocationChange)

        return () => {
            window.removeEventListener('hashchange', handleLocationChange)
            window.removeEventListener('popstate', handleLocationChange)
        }
    }, [])

    return location
}
