import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

const external = ["ws"];

export default [
  // ESM build (Node.js)
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.mjs",
      format: "esm",
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve(),
      commonjs(),
    ],
  },
  // CommonJS build (Node.js)
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.cjs",
      format: "cjs",
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve(),
      commonjs(),
    ],
  },
  // Browser build (bundled, minified)
  {
    input: "src/browser.ts",
    output: {
      file: "dist/browser.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve({ browser: true }),
      commonjs(),
      terser(),
    ],
  },
];
