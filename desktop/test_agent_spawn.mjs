import { spawn } from 'node:child_process'

const agent = 'codex' // codex or claude
const shell = true
const prompt = '"Reply with exactly: spawn test ok"'
const argumentsList = agent === 'codex'
    ? ['exec', '--json', prompt]
    : ['--print', '--verbose', '--output-format', 'stream-json', prompt]

spawn(agent, argumentsList, { shell, stdio: 'inherit' })
