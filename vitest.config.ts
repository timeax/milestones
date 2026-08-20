import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/dom/types.ts",
        "src/editors/editor-contracts.ts",
        "src/editors/index.ts",
        "src/editors/internal/draft.ts",
        "src/editors/internal/session.ts",
        "src/model/breakdown.ts",
        "src/model/domain.ts",
        "src/model/execution.ts",
        "src/model/task.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 90,
        lines: 95,
      },
    }
  }
});
