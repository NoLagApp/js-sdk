import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env.test file
config({ path: ".env.test" });

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
  },
});
