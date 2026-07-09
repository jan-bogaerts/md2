import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^mdi-material-ui\/(.+)$/, replacement: 'mdi-material-ui/esm/$1' },
        ],
    },
    test: {
        environment: 'jsdom',
        // The forks pool can crash under rolldown-vite; threads is stable and faster here.
        pool: 'threads',
        setupFiles: './src/test/setup.ts',
    },
})
