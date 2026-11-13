// ESLint 9 flat config. Only the eslint package is installed: the rules of
// eslint:recommended are listed here instead of importing @eslint/js, and
// globals are declared by hand instead of using the globals package.

import { defineConfig, globalIgnores } from "eslint/config";

const readonly = (names) => Object.fromEntries(names.map((name) => [name, "readonly"]));

// Web platform APIs available in browsers and in Node 20+.
const SHARED_GLOBALS = readonly([
  "AbortController",
  "Blob",
  "TextDecoder",
  "TextEncoder",
  "URL",
  "URLSearchParams",
  "clearTimeout",
  "console",
  "fetch",
  "queueMicrotask",
  "Request",
  "Response",
  "setTimeout",
  "structuredClone",
]);

const NODE_GLOBALS = { ...SHARED_GLOBALS, ...readonly(["Buffer", "process"]) };

// process.env.IWC is replaced at build time by webpack's DefinePlugin.
const BROWSER_GLOBALS = { ...SHARED_GLOBALS, ...readonly(["DOMPoint", "Image", "ResizeObserver", "document", "navigator", "process", "window"]) };

// eslint:recommended (ESLint 9.39).
const RECOMMENDED = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-case-declarations": "error",
  "no-class-assign": "error",
  "no-compare-neg-zero": "error",
  "no-cond-assign": "error",
  "no-const-assign": "error",
  "no-constant-binary-expression": "error",
  "no-constant-condition": "error",
  "no-control-regex": "error",
  "no-debugger": "error",
  "no-delete-var": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty": "error",
  "no-empty-character-class": "error",
  "no-empty-pattern": "error",
  "no-empty-static-block": "error",
  "no-ex-assign": "error",
  "no-extra-boolean-cast": "error",
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-global-assign": "error",
  "no-import-assign": "error",
  "no-invalid-regexp": "error",
  "no-irregular-whitespace": "error",
  "no-loss-of-precision": "error",
  "no-misleading-character-class": "error",
  "no-new-native-nonconstructor": "error",
  "no-nonoctal-decimal-escape": "error",
  "no-obj-calls": "error",
  "no-octal": "error",
  "no-prototype-builtins": "error",
  "no-redeclare": "error",
  "no-regex-spaces": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-this-before-super": "error",
  "no-undef": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-labels": "error",
  "no-unused-private-class-members": "error",
  "no-unused-vars": "error",
  "no-useless-backreference": "error",
  "no-useless-catch": "error",
  "no-useless-escape": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
};

const STRICTER = {
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-var": "error",
  "prefer-const": "error",
};

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/build/",
    "packages/core-js/dist/",
    "packages/core-java/",
    ".claude/",
  ]),
  {
    files: ["**/*.js", "**/*.mjs", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: NODE_GLOBALS,
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { ...RECOMMENDED, ...STRICTER },
  },
  {
    // The core runs in browsers and Node alike: shared web APIs only.
    files: ["packages/core-js/src/**/*.js"],
    languageOptions: { globals: SHARED_GLOBALS },
  },
  {
    files: ["app/src/**/*.js", "app/src/**/*.jsx"],
    languageOptions: {
      globals: BROWSER_GLOBALS,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // ESLint 9 does not count JSX tags as uses of a variable, so imported
      // components (capitalised) are exempt; everything else is still checked.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z]" }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@mui/*", "@emotion/*"], message: "Import UI components from src/ui/index.js." },
            { group: ["@convert-tools/core/*"], message: "Import the core from @convert-tools/core only." },
            { group: ["**/packages/**"], message: "Import the core from @convert-tools/core only." },
          ],
        },
      ],
    },
  },
  {
    files: ["app/src/ui/index.js"],
    rules: { "no-restricted-imports": "off" },
  },
]);
