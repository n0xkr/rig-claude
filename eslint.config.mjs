import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/coverage/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.d.ts',
      'docs/**',
      '.planning/**',
      '.claude/**',
      // protótipo legado fora do monorepo (não é workspace, não é buildado no CI)
      'gestão-de-frotas-&-viagens/**',
      // dados/importações
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // sanitização legítima de entradas (`[\x00-\x1f]`) e classes de caractere
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-irregular-whitespace': ['warn', { skipStrings: true, skipTemplates: true, skipComments: true }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // só as regras clássicas: as demais (set-state-in-effect, purity,
      // refs-during-render…) são opinativas do plugin v7/React Compiler e
      // marcariam dezenas de pontos legítimos desta base.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.config.{ts,js,mjs}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
