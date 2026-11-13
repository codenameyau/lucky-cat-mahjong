const path = require("node:path");
const { includeIgnoreFile } = require("@eslint/compat");
const js = require("@eslint/js");
const html = require("eslint-plugin-html");
const globals = require("globals");

module.exports = [
  includeIgnoreFile(path.join(__dirname, ".gitignore")),
  // Agents' worktrees: each is a whole copy of the repository.
  { ignores: [".claude/", ".cursor/"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      // Google Analytics: each page's snippet defines these.
      globals: { ...globals.browser, ...globals.node, dataLayer: "writable", gtag: "readonly" },
    },
    rules: {
      // Double quotes, so an apostrophe is a plain ' (.cursor/rules/double-quotes.mdc).
      quotes: ["error", "double", { allowTemplateLiterals: true }],
      "no-useless-escape": "error",
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The coach marks hand names with \u0001 and \u0002.
      "no-control-regex": "off",
      // Tests match the game's source, indentation included.
      "no-regex-spaces": "off",

      // Likely bugs
      "array-callback-return": "error",
      "no-constructor-return": "error",
      "no-new-native-nonconstructor": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unreachable-loop": "error",
      "no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "no-useless-backreference": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      radix: "error",

      // Unsafe or outdated
      "no-caller": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-implied-eval": "error",
      "no-iterator": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-proto": "error",
      "no-script-url": "error",
      "no-throw-literal": "error",
      "prefer-object-has-own": "error",
      "prefer-promise-reject-errors": ["error", { allowEmptyReject: true }],

      // Simpler code
      "default-case-last": "error",
      "dot-notation": "error",
      "no-array-constructor": "error",
      "no-else-return": "error",
      "no-extra-bind": "error",
      "no-extra-label": "error",
      "no-label-var": "error",
      "no-lone-blocks": "error",
      "no-lonely-if": "error",
      "no-multi-str": "error",
      "no-new": "error",
      "no-object-constructor": "error",
      "no-return-assign": "error",
      "no-sequences": "error",
      "no-unneeded-ternary": "error",
      "no-useless-call": "error",
      "no-useless-computed-key": "error",
      "no-useless-concat": "error",
      "no-useless-constructor": "error",
      "no-useless-rename": "error",
      "no-useless-return": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "prefer-numeric-literals": "error",
      "prefer-regex-literals": "error",
      "symbol-description": "error",
      "unicode-bom": "error",
      yoda: "error",
    },
  },
  {
    files: ["sw.js", "play-mahjong/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
];
