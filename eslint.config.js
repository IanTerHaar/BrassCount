const base = require('./.eslintrc.js');

module.exports = [
  {
    ignores: (base.ignorePatterns || []).concat([
      'ios/',
      'build/',
      'dist/',
      '.bundle/',
      '*.config.js',
    ]),
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    settings: base.settings || {},
    plugins: {
      import: require('eslint-plugin-import'),
    },
    rules: base.rules || {},
  },
];
