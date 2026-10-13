import nextPlugin from "@next/eslint-plugin-next"

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test/**",
      "public/**",
      "scripts/**",
    ],
  },
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "off",
    },
  },
]
