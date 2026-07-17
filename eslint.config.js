import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import vueTsEslintConfig from "@vue/eslint-config-typescript";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "src-tauri/target/**", "node_modules/**", "src/vite-env.d.ts", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  ...vueTsEslintConfig(),
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "vue/multi-word-component-names": "off",
    },
  },
);
