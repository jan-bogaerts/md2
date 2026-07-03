const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  {
    ignores: ['node_modules'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
]
