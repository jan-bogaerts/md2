const actionFiles = require('./action_files')
const gitCommands = require('./git_commands')
const projectFiles = require('./project_files')

module.exports = { ...gitCommands, ...projectFiles, ...actionFiles }
