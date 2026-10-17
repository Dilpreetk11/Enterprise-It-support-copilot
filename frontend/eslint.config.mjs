import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
export default defineConfig([
  globalIgnores([".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
  js.configs.recommended, ...ts.configs.recommended,
  { files: ["**/*.tsx"], extends: [hooks.configs.flat.recommended, a11y.flatConfigs.recommended], settings: { react: { version: "19.2" } } },
]);
