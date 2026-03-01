import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      ANTHROPIC_API_KEY: "test-key-for-vitest",
      OPENAI_API_KEY: "test-key-for-vitest",
    },
  },
});
