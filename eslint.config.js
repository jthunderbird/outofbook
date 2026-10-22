// Lint: JS and typescript-eslint recommended, plus the two classic React hooks
// rules. The hooks plugin's React Compiler rules are left off: the code is not
// written for the compiler.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "poc/",
      "**/node_modules/",
      "**/dist/",
      "apps/web/public/",
      "apps/android-capacitor/android/",
      "apps/android-capacitor/www/",
      "apps/android-twa/",
      "packages/core/src/data/",
      "test-results/",
      "playwright-report/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
