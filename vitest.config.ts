import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".cache/vitest",
  // Match the production bundle's text loader so prompt/resource tests exercise
  // the real markdown, rather than mocks that can drift from shipped content.
  plugins: [{
    name: "inline-markdown",
    transform(source, id) {
      if (id.endsWith(".md")) return { code: `export default ${JSON.stringify(source)};`, map: null };
      return null;
    },
  }],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Real ffmpeg and Chrome fixtures take more than 5 s each when the full suite runs in parallel.
    testTimeout: 30000,
  },
});
