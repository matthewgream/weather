import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
export default defineConfig([
  {
    files: ["**/*.js", "**/assets/js/*.js"],
    ignores: [],
  },
  {
    files: ["**/*.js", "**/assets/js/*.js"],
    languageOptions: {
	  ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ["**/*.js", "**/assets/js/*.js"],
    plugins: { js },
    extends: ["js/recommended"]
  },
]);
