const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'dist/',
      '.env',
      '*.log',
      '.DS_Store',
      '.vscode/',
      '.idea/',
      '*.min.js',
    ],
  },

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        ButtonBuilder: 'readonly',
        ButtonStyle: 'readonly',
        Events: 'readonly',
        Client: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      'no-console': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'prefer-const': 'error',
      'arrow-spacing': ['error', { before: true, after: true }],
      'comma-dangle': ['error', 'only-multiline'],
      'eol-last': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      'no-trailing-spaces': 'error',
      'object-curly-spacing': ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
    },
  },

  {
    files: ['**/__tests__/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  prettier,
];
