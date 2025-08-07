import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Браузерные глобальные переменные
        ...globals.browser,
        ...globals.es2021,
        
        // jQuery
        $: 'readonly',
        jQuery: 'readonly',
        
        // Django глобальные переменные
        Django: 'readonly',
        gettext: 'readonly',
        ngettext: 'readonly',
        interpolate: 'readonly',
        get_format: 'readonly',
        date_format: 'readonly',
        number_format: 'readonly',
        pluralidx: 'readonly',
        get_available_language_codes: 'readonly',
        get_language_info: 'readonly',
        get_language_bidi: 'readonly',
        csrf_token: 'readonly',
        csrfmiddlewaretoken: 'readonly',
        
        // HTMX
        htmx: 'readonly',
        
        // Alpine.js
        Alpine: 'readonly',
        
        // Bulma
        bulma: 'readonly',
        
        // FontAwesome
        FontAwesome: 'readonly'
      }
    },
    rules: {
      // Отключить правила, которые не подходят для Django проекта
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-alert': 'off',
      'no-undef': 'warn',
      'no-unused-expressions': 'off',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-extra-semi': 'off',
      'no-irregular-whitespace': 'error',
      'no-multiple-empty-lines': 'off',
      'no-trailing-spaces': 'off',
      'no-unreachable-loop': 'error',
      'no-useless-backreference': 'error',
      'no-useless-catch': 'off',
      'no-useless-escape': 'off',
      'no-useless-return': 'off',
      'prefer-const': 'off',
      'valid-typeof': 'error',
      'curly': 'off',
      'eqeqeq': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-sequences': 'off',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'off',
      'no-unused-labels': 'error',
      'no-useless-call': 'off',
      'no-useless-concat': 'off',
      'no-useless-rename': 'off',
      'no-var': 'off',
      'object-shorthand': 'off',
      'prefer-arrow-callback': 'off',
      'prefer-template': 'off',
      'yoda': 'off'
    }
  },
  {
    files: ['**/*.js'],
    ignores: [
      '**/node_modules/**',
      '**/staticfiles/**',
      '**/dist/**',
      '**/build/**',
      '**/venv/**',
      '**/env/**',
      '**/__pycache__/**',
      '**/*.min.js',
      '**/htmx.min.js',
      '**/jquery-*.min.js'
    ]
  }
];
