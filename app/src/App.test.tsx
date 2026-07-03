import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
    it('renders the initialized app shell', () => {
        render(<App />)

        expect(screen.getByRole('heading', { name: 'MD2' })).not.toBeNull()
        expect(screen.getByText(/React app initialized/i)).not.toBeNull()
    })
})
