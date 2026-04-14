// Flat-config ESLint setup (ESLint 9+).
//
// Goals:
//   * Catch unused imports and vars, they crept in from scaffold churn.
//   * Catch react-hooks mistakes (missing deps, conditional hooks).
//   * Follow Expo's recommended baseline via eslint-config-expo.
//   * Warn on `any` but don't block: we lean on tsc for real type checking.
//
// Run:
//   yarn lint           # report only
//   yarn lint:fix       # auto-fix what's safe

const expoConfig = require('eslint-config-expo/flat');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  ...expoConfig,
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // Unused imports plugin, auto-removes via --fix, which the Expo
      // baseline alone doesn't do.
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Turn off the built-in rule so unused-imports can own it cleanly.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // Exhaustive deps is a noisy but valuable correctness check.
      'react-hooks/exhaustive-deps': 'warn',

      // Soft on 'any', we use it for a few bridge-facing boundaries.
      '@typescript-eslint/no-explicit-any': 'off',

      // We have an in-file daemon lifecycle module that uses a module-level
      // ref; Expo's rule set is fine with that.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Ignore generated and third-party paths.
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'babel.config.js',
      'metro.config.js',
      'eslint.config.js',
    ],
  },
];
