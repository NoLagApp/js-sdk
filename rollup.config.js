import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

// Node.js external dependencies
const nodeExternal = ["ws"];

export default [
  // ESM build (Node.js)
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.mjs",
      format: "esm",
      sourcemap: true,
    },
    external: nodeExternal,
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
    external: nodeExternal,
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve(),
      commonjs(),
    ],
  },
  // Browser build (bundled, minified)
  // Also works for React Native (uses native WebSocket)
  {
    input: "src/browser.ts",
    output: {
      file: "dist/browser.js",
      format: "esm",
      sourcemap: true,
    },
    // No external - bundle everything for browser
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve({ browser: true }),
      commonjs(),
      terser(),
    ],
  },
];
