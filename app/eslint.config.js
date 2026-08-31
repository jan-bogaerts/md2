import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const projectRules = {
  ...react.configs.recommended.rules,
  ...reactHooks.configs.recommended.rules,
  eqeqeq: 'off',
  'no-underscore-dangle': 'off',
  'no-param-reassign': 'off',
  'consistent-return': 'off',
  'comma-dangle': ['error', 'always-multiline'],
  'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
  'no-restricted-properties': ['error', {
    object: 'crypto',
    property: 'randomUUID',
    message: 'Not available in insecure browser contexts (remote control over http). Use generateUuid() from src/data/uuid.',
  }],
  'no-use-before-define': ['error', { variables: true, functions: false, classes: true }],
  'no-await-in-loop': 'off',
  'guard-for-in': 'off',
  'no-const-assign': 'error',
  'no-continue': 'off',
  'import/prefer-default-export': 'off',
  indent: ['error', 4, { SwitchCase: 1 }],
  'max-len': ['error', { code: 140, ignoreComments: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
  'no-trailing-spaces': ['warn', { skipBlankLines: true }],
  'import/no-extraneous-dependencies': 'off',
  'no-plusplus': 'off',
  'no-multi-spaces': ['error', { ignoreEOLComments: true }],
  quotes: 'off',
  'object-curly-newline': ['error', {
    ObjectExpression: { multiline: true },
    ObjectPattern: { multiline: true },
  }],
  'no-console': 'off',
  'class-methods-use-this': ['error', { exceptMethods: ['render', 'componentDidMount'] }],
  'prefer-destructuring': 'off',
  'react/react-in-jsx-scope': 'off',
  'react/prop-types': 'off',
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
}

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      import: importPlugin,
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: {
        createClass: 'createReactClass',
        pragma: 'React',
        fragment: 'Fragment',
        version: 'detect',
        flowVersion: '0.53',
      },
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: projectRules,
  },
)
