import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use chrome.storage via Service Worker.' },
        { name: 'sessionStorage', message: 'Use chrome.storage via Service Worker.' },
      ],
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
    },
  },
  {
    files: ['**/content/content-script.js'],
    languageOptions: { sourceType: 'script' },
  },
];
