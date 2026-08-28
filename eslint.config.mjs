import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "node_modules/**",
      "parser/target/**",
      "scripts/**",
    ],
  },
  ...nextConfig,
];

export default eslintConfig;
