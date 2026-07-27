declare module 'graphql-depth-limit' {
  import type { ValidationRule } from 'graphql';
  function depthLimit(
    maxDepth: number,
    options?: { ignore?: (string | RegExp | ((queryDepths: number[]) => boolean))[] },
    callback?: (args: { depths: number[]; depth: number }) => void,
  ): ValidationRule;
  export = depthLimit;
}
