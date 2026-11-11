import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'android/', '.omc/', '.playwright-mcp/'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  // core는 순수 TS: 렌더러, DOM, 비결정적 랜덤, 상위 계층에 의존하지 않는다 (PLAN 1절).
  // core → config 의존은 허용한다 (PLAN 3절).
  // flat config의 globals는 앞 블록과 병합되어 여기서 비울 수 없다. 전역은 no-restricted-globals로 막는다
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'core는 Phaser를 import하지 않는다.' }],
          patterns: [
            {
              group: ['@capacitor/*'],
              message: 'core는 네이티브 기능(Capacitor)을 쓰지 않는다.',
            },
            {
              group: ['**/view', '**/view/**', '**/scenes', '**/scenes/**'],
              message: 'core는 view / scenes에 의존하지 않는다.',
            },
            {
              group: ['**/storage', '**/storage/**', '**/online', '**/online/**'],
              message: 'core는 storage / online에 의존하지 않는다.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '랜덤은 core/rng.ts의 seed RNG만 쓴다.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core에서 DOM을 쓰지 않는다.' },
        { name: 'document', message: 'core에서 DOM을 쓰지 않는다.' },
        { name: 'globalThis', message: 'core에서 전역 객체를 거쳐 쓰지 않는다.' },
        { name: 'self', message: 'core에서 전역 객체를 거쳐 쓰지 않는다.' },
        { name: 'navigator', message: 'core에서 브라우저 API를 쓰지 않는다.' },
        { name: 'localStorage', message: 'core에서 저장소를 쓰지 않는다.' },
      ],
      // no-restricted-imports는 정적 import만 본다
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'core는 동적 import를 쓰지 않는다.' },
      ],
    },
  },
  prettier,
);
