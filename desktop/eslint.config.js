const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

const projectRules = {
    eqeqeq: 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
    'consistent-return': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
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
    semi: ['error', 'always'],
};

module.exports = [
    {ignores: ['node_modules']},
    {
        files: ['**/*.{js,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.jest,
            },
            parserOptions: {ecmaFeatures: {jsx: true}},
        },
        plugins: {import: importPlugin},
        settings: {'import/resolver': {node: {extensions: ['.js', '.jsx', '.mjs']}}},
        rules: {
            ...js.configs.recommended.rules,
            ...projectRules,
        },
    },
    {
        files: ['**/*.js'],
        languageOptions: {sourceType: 'commonjs'},
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {sourceType: 'module'},
    },
];
