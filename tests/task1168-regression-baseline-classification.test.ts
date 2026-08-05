import { describe, expect, it } from "vitest"
import { classifyRegressionFailure } from "./fixtures/regression-failure.ts"

describe("task1168 regression baseline classification", () => {
  it.each([
    ["tests/run.test.ts", "Primary database runtime is not initialized.", "db_runtime_not_initialized"],
    ["tests/run.test.ts", "Primary database runtime is already initialized for another instance.", "db_runtime_instance_conflict"],
    ["tests/run.test.ts", "Cannot read properties of undefined (reading 'insert')", "runtime_dependency_missing"],
    ["tests/static.test.ts", "spawnSync rg ENOENT", "test_tool_missing"],
    ["tests/policy.test.ts", "ENOENT: no such file or directory, open '/repo/.tasks/task004.md'", "removed_task_document_dependency"],
    ["tests/source-static.test.ts", "expected source to contain explicit config", "stale_static_contract"],
    ["tests/panel.test.tsx", "expected rendered output to contain status", "ui_projection_contract"],
  ] as const)("classifies %s as %s", (testFile, message, expected) => {
    expect(classifyRegressionFailure({ testFile, message })).toBe(expected)
  })

  it("keeps unknown failures visible instead of guessing", () => {
    expect(classifyRegressionFailure({
      testFile: "tests/unknown.test.ts",
      message: "unexpected result",
    })).toBe("unclassified")
  })
})
