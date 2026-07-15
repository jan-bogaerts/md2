import { spawn } from 'node:child_process'

const agent = 'codex' // codex or claude
const shell = true
const prompt = '"Reply with exactly: spawn test ok"'
const argumentsList = agent === 'codex'
    ? ['exec', '--json', prompt]
    : ['--print', '--verbose', '--output-format', 'stream-json', prompt]

spawn(agent, argumentsList, { shell, stdio: 'inherit' })

/*
response:

{"type":"thread.started","thread_id":"019f66c1-7d10-7462-b947-30001817ec03"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"spawn test ok"}}
{"type":"turn.completed","usage":{"input_tokens":15514,"cached_input_tokens":9984,"output_tokens":7,"reasoning_output_tokens":0}}
*/