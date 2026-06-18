/**
 * eslint.config.js
 * Flat config (ESLint 9). Base: @eslint/js recommended.
 * eslint-config-prettier is last so Prettier owns formatting rules.
 */

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'dist-single/**', 'docs/fixtures/**', '**/*.min.js'],
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Allow intentionally empty catch blocks (we use them for guarded cleanup paths).
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Ignore args/vars prefixed with `_`.
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Allow console — this is a developer tool, not a consumer lib.
      'no-console': 'off',
      // `===` required, with smart exceptions (typeof, null).
      eqeqeq: ['error', 'smart'],
      // Off: too many false positives on legitimate init-before-loop patterns
      // (binary search state, parser cursor vars). See smart-compress.js,
      // gif-decoder.js, preview.js.
      'no-useless-assignment': 'off',
    },
  },

  // Web Worker scope — uses `self`, `postMessage`, etc.
  {
    files: ['src/modules/process-worker.js', 'src/modules/**/*-worker.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },

  // Node scope — Vite configs + build scripts.
  {
    files: ['vite.config.js', 'vite.*.config.js', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  prettier,
];
