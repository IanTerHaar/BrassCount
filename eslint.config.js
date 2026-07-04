const base = require('./.eslintrc.js');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: (base.ignorePatterns || []).concat([
      'ios/',
      'build/',
      'dist/',
      '.bundle/',
    ]),
  },
  // TypeScript and JSX files (with project)
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
      },
    },
    settings: base.settings || {},
    plugins: {
      import: require('eslint-plugin-import'),
    },
    rules: base.rules || {},
  },
  // JavaScript files (without project)
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: base.settings || {},
    plugins: {
      import: require('eslint-plugin-import'),
    },
    rules: base.rules || {},
  },
];
