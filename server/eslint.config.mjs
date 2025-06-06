import globals from 'globals';
import js from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import preferObjectSpreadPlugin from 'eslint-plugin-prefer-object-spread';
import regexpPlugin from 'eslint-plugin-regexp';
import properTernaryPlugin from '@getify/eslint-plugin-proper-ternary';
import properArrowsPlugin from '@getify/eslint-plugin-proper-arrows';
import unicornPlugin from 'eslint-plugin-unicorn';
import ternaryPlugin from 'eslint-plugin-ternary';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import brettz9Plugin from '@brettz9/eslint-plugin';
import googleappsscriptPlugin from 'eslint-plugin-googleappsscript';
import securityPlugin from 'eslint-plugin-security';
import securityNodePlugin from 'eslint-plugin-security-node';

export default [
    // Base configuration
    js.configs.recommended,

    // Plugin configurations that include their own plugin definitions
    nodePlugin.configs['flat/recommended'],
    regexpPlugin.configs['flat/recommended'],
    unicornPlugin.configs['flat/all'],
    sonarjsPlugin.configs.recommended,

    // Main configuration with only plugins that aren't already defined
    {
        files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.commonjs,
                ...googleappsscriptPlugin.environments.googleappsscript.globals,
                CONFIG: 'readonly',
            },
        },
        plugins: {
            'prefer-object-spread': preferObjectSpreadPlugin,
            '@getify/proper-ternary': properTernaryPlugin,
            '@getify/proper-arrows': properArrowsPlugin,
            'ternary': ternaryPlugin,
            '@brettz9': brettz9Plugin,
            'googleappsscript': googleappsscriptPlugin,
            'security': securityPlugin,
            'security-node': securityNodePlugin,
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],

            'unicorn/prefer-module': 'off',
            'unicorn/numeric-separators-style': 'off',
            'unicorn/no-array-for-each': 'off',
            'unicorn/no-array-reduce': 'off',
            'unicorn/no-anonymous-default-export': 'off',
            'unicorn/prefer-node-protocol': 'off',
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/catch-error-name': ['error', { name: 'e' }],
            'unicorn/prefer-top-level-await': 'off',
            'unicorn/prefer-at': 'off',
            'unicorn/no-useless-undefined': 'off',
            'unicorn/no-lonely-if': 'off',
            'unicorn/no-await-expression-member': 'off',
            'unicorn/prefer-global-this': 'off',
            'unicorn/prefer-single-call': 'off',
            'unicorn/prefer-json-parse-buffer': 'off',

            'sonarjs/no-clear-text-protocols': 'off',
            'sonarjs/prefer-single-boolean-return': 'off',
            'sonarjs/publicly-writable-directories': 'off',
            'sonarjs/pseudo-random': 'off',
            'sonarjs/hashing': 'off',
            'sonarjs/content-length': 'off',
            'sonarjs/slow-regex': 'off',
	    'sonarjs/cognitive-complexity': ['error', 50],

            'n/hashbang': 'off',
            'n/no-unsupported-features/node-builtins': 'off',

            // ESLint core rules
            'max-depth': 'warn',
            'no-div-regex': 'warn',
            'no-constant-binary-expression': 'warn',
            'prefer-destructuring': 'error',
            'no-multi-assign': 'error',
            'no-return-assign': 'warn',
            'consistent-return': 'warn',
            'arrow-body-style': 'warn',
            'no-new-object': 'warn',
            'block-scoped-var': 'warn',
            'no-case-declarations': 'off',
            'use-isnan': 'error',
            'dot-notation': 'warn',
            'object-shorthand': 'warn',
            'no-useless-constructor': 'warn',
            'no-useless-concat': 'warn',
            'no-unneeded-ternary': 'warn',
            'no-redeclare': 'error',
            'no-implicit-coercion': 'error',
            'no-delete-var': 'error',
            'no-template-curly-in-string': 'error',
            'no-unmodified-loop-condition': 'warn',
            'prefer-exponentiation-operator': 'error',

            // Plugin rules
            // 'regexp/use-ignore-case': 'off',
            // 'regexp/no-unused-capturing-group': 'off',
            // 'regexp/no-useless-non-capturing-group': 'off',

            '@brettz9/prefer-for-of': 'off',

            'unicorn/switch-case-braces': 'off',

            'security-node/non-literal-reg-expr': 'off',
            'security-node/detect-eval-with-expr': 'off',
            'security-node/detect-crlf': 'off',
            'security-node/detect-insecure-randomness': 'off',
            'security-node/disable-ssl-across-node-server': 'off',
        },
    },

    // Override for ESLint config files
    {
        files: ['.eslintrc.{js,cjs}'],
        languageOptions: {
            sourceType: 'script',
        },
    },
];
