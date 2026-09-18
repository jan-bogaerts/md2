import { describe, expect, it } from 'vitest'
import { excludeAgentInstructionFiles, excludeAgentInstructionPaths, findAgentInstructionPaths } from './agent_instruction_paths'

describe('agent instruction paths', () => {
    it('matches supported paths case-insensitively and keeps original casing', () => {
        const paths = findAgentInstructionPaths([
            'README.TXT',
            'docs/AGENTS.MD',
            'docs/ReadMe.md',
            'other/readme.md',
            '.GitHub/Copilot-Instructions.MD',
            '.github/instructions/review.instructions.MD',
            'nested/CLAUDE.md',
            '.Claude/Rules/frontend/UI.MD',
            '.claude/rules/skip.txt',
        ])

        expect(paths).toEqual([
            '.Claude/Rules/frontend/UI.MD',
            '.GitHub/Copilot-Instructions.MD',
            '.github/instructions/review.instructions.MD',
            'docs/AGENTS.MD',
            'docs/ReadMe.md',
            'nested/CLAUDE.md',
            'README.TXT',
        ])
    })

    it('deduplicates normalized paths and excludes instructions from card and tree inputs', () => {
        const repositoryPaths = ['AGENTS.md', 'agents.MD', 'README.md', 'design/card.md']
        const files = repositoryPaths.map((path) => ({ content: path, path }))

        expect(findAgentInstructionPaths(repositoryPaths)).toEqual(['AGENTS.md', 'README.md'])
        expect(excludeAgentInstructionFiles(files, repositoryPaths).map(({ path }) => path)).toEqual(['design/card.md'])
        expect(excludeAgentInstructionPaths(repositoryPaths)).toEqual(['design/card.md'])
    })
})
