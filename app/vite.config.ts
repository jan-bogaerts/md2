import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        // The forks pool can crash under rolldown-vite; threads is stable and faster here.
        pool: 'threads',
        setupFiles: './src/test/setup.ts',
    },
})
