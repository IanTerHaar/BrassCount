module.exports = {
  root: true,
  extends: [
    '@react-native',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  ignorePatterns: [
    'node_modules/',
    'android/',
    'coverage/',
    '*.config.js',
    'babel.config.js',
    'metro.config.js',
    'jest.config.js',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'import/no-unresolved': ['error', { ignore: ['^@env$'] }],
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        pathGroups: [
          { pattern: 'react', group: 'external', position: 'before' },
          { pattern: 'react-native', group: 'external', position: 'before' },
          { pattern: '@/**', group: 'internal' },
        ],
        pathGroupsExcludedImportTypes: ['react', 'react-native'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
  },
};
