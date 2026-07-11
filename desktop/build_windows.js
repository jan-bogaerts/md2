const { spawn } = require('node:child_process')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..')

function runNpm(args, spawnImplementation = spawn) {
    return new Promise((resolve, reject) => {
        const child = spawnImplementation('npm', args, {
            cwd: repositoryRoot,
            env: process.env,
            shell: process.platform === 'win32',
            stdio: 'inherit',
        })

        child.once('error', reject)
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`npm ${args.join(' ')} stopped by signal ${signal}`))
                return
            }
            if (code !== 0) {
                reject(new Error(`npm ${args.join(' ')} failed with exit code ${code}`))
                return
            }

            resolve()
        })
    })
}

async function buildWindows(runNpmImplementation = runNpm) {
    await runNpmImplementation(['run', 'build', '--prefix', 'app'])
    await runNpmImplementation(['run', 'package:windows', '--prefix', 'desktop'])
}

if (require.main === module) {
    buildWindows().catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
}

module.exports = { buildWindows, runNpm }
