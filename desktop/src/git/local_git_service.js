const gitCommands = require('./git_commands');
const projectFiles = require('../project/project_files');
const projectFolderGitInclusion = require('../project/project_folder_git_inclusion');
const actionFiles = require('../actions/action/action_files');
const activityFiles = require('../actions/activity/activity_files');

module.exports = {
    ...gitCommands,
    ...projectFiles,
    ...projectFolderGitInclusion,
    ...actionFiles,
    ...activityFiles,
};
