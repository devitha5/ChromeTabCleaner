import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["background.js", "popup.js", "lib/**/*.js"],
      reporter: ["text", "html"],
    },
  },
});
