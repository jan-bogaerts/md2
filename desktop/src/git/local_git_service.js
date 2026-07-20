const gitCommands = require('./git_commands');
const projectFiles = require('../project/project_files');
const actionFiles = require('../actions/action_files');
const activityFiles = require('../actions/activity_files');

module.exports = {
    ...gitCommands,
    ...projectFiles,
    ...actionFiles,
    ...activityFiles,
};
