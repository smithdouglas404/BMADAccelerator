import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "vendor/**",
      "workspaces/**",
      "studio-skills/**/assets/**",
    ],
  },
  {
    // The Studio keeps the design team's markup as is, including plain links and images.
    files: ["src/studio/**"],
    rules: { "@next/next/no-html-link-for-pages": "off", "@next/next/no-img-element": "off" },
  },
];

export default eslintConfig;
