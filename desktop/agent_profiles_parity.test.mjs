import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BUILTIN_AGENT_PROFILES,
    buildAgentCommand,
    defaultModelForProfile,
    validateAgentProfiles,
} from './agent_profiles'

async function readTypescriptBuiltins() {
    const sourcePath = join(process.cwd(), '..', 'app', 'src', 'data', 'agent_profiles.ts')
    const source = await readFile(sourcePath, 'utf8')
    const match = /export const BUILTIN_AGENT_PROFILES: AgentProfile\[\] = (?<profiles>\[[\s\S]*?\n\])/u.exec(source)
    if (!match?.groups?.profiles) throw new Error('Cannot read TypeScript built-in agent profiles')

    return Function(`"use strict"; return (${match.groups.profiles});`)()
}

describe('agent_profiles parity', () => {
    it('keeps desktop built-ins aligned with the TypeScript source', async () => {
        await expect(readTypescriptBuiltins()).resolves.toEqual(BUILTIN_AGENT_PROFILES)
    })

    it('keeps validation and command building behavior covered by shared built-ins', () => {
        const profiles = validateAgentProfiles(BUILTIN_AGENT_PROFILES)
        const codex = profiles.find((profile) => profile.name === 'codex')
        if (!codex) throw new Error('Missing codex built-in profile')

        expect(defaultModelForProfile(codex)).toBe('')
        expect(buildAgentCommand(codex, 'gpt-5')).toBe('codex --model gpt-5')
    })
})
