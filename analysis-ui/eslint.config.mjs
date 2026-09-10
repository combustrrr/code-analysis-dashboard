import tseslint from 'typescript-eslint';
export default [
  {ignores:['dist/**','public/**','node_modules/**','playwright-report/**','test-results/**']},
  ...tseslint.configs.recommended,
];
