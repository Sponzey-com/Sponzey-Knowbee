import { describe, expect, it } from "vitest"

import {
  buildWorktreeBaselineReceipt,
  classifyWorktreeChanges,
} from "../packages/core/src/maintenance/worktree-baseline.js"

describe("task001 worktree baseline classification", () => {
  it("classifies changed paths in stable order and binds generated files to canonical sources", () => {
    const result = classifyWorktreeChanges([
      { status: "??", path: ".tasks/task001.md" },
      { status: " M", path: "packages/core/src/agent/runtime.js" },
      { status: "M ", path: "packages/core/src/agent/runtime.ts" },
      { status: " D", path: "docs/legacy.md" },
      { status: "A ", path: "prompts/result_review.md" },
      { status: "??", path: "packages/core/src/storage/migrations/v99.ts" },
      { status: "??", path: "tests/worktree.test.ts" },
    ])

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(
      result.records.map((record) => [
        record.path,
        record.changeKind,
        record.category,
        record.ownerArtifactId,
      ]),
    ).toEqual([
      [".tasks/task001.md", "untracked", "task_only", ".tasks/task001.md"],
      ["docs/legacy.md", "deleted", "docs", "docs/legacy.md"],
      [
        "packages/core/src/agent/runtime.js",
        "modified",
        "generated",
        "packages/core/src/agent/runtime.ts",
      ],
      [
        "packages/core/src/agent/runtime.ts",
        "modified",
        "source",
        "packages/core/src/agent/runtime.ts",
      ],
      [
        "packages/core/src/storage/migrations/v99.ts",
        "untracked",
        "migration",
        "packages/core/src/storage/migrations/v99.ts",
      ],
      ["prompts/result_review.md", "added", "prompt", "prompts/result_review.md"],
      ["tests/worktree.test.ts", "untracked", "test", "tests/worktree.test.ts"],
    ])
  })

  it("fails closed for unsafe paths, unknown statuses, and unowned artifacts", () => {
    const result = classifyWorktreeChanges([
      { status: "??", path: "../outside.txt" },
      { status: "ZZ", path: "packages/core/src/valid.ts" },
      { status: "??", path: "misc/unknown.bin" },
    ])

    expect(result.complete).toBe(false)
    expect(result.records).toEqual([])
    expect(result.diagnostics).toEqual([
      { path: "../outside.txt", code: "unsafe_path" },
      { path: "misc/unknown.bin", code: "artifact_unclassified" },
      { path: "packages/core/src/valid.ts", code: "status_unrecognized" },
    ])
  })

  it("treats governed root configuration files as canonical sources", () => {
    const result = classifyWorktreeChanges([
      { status: " M", path: ".gitignore" },
      { status: "??", path: "devenv.toml" },
    ])

    expect(result).toMatchObject({ complete: true, diagnostics: [] })
    expect(
      result.records.map((record) => [record.path, record.category, record.ownerArtifactId]),
    ).toEqual([
      [".gitignore", "source", ".gitignore"],
      ["devenv.toml", "source", "devenv.toml"],
    ])
  })

  it("builds a deterministic schema-versioned receipt from explicit metadata", () => {
    const receipt = buildWorktreeBaselineReceipt({
      repositoryRoot: "/workspace/knowbee",
      headSha: "abc123",
      headCommittedAt: "2026-07-16T00:00:00Z",
      capturedAt: "2026-07-16T01:00:00Z",
      changes: [
        { status: "??", path: "tests/new.test.ts" },
        { status: " M", path: "PROJECT.md" },
        { status: " D", path: "packages/core/src/old.ts" },
      ],
    })

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      repositoryRoot: "/workspace/knowbee",
      headSha: "abc123",
      headCommittedAt: "2026-07-16T00:00:00Z",
      capturedAt: "2026-07-16T01:00:00Z",
      complete: true,
      counts: {
        total: 3,
        tracked: 2,
        untracked: 1,
        deleted: 1,
        unknown: 0,
        byCategory: { docs: 1, source: 1, test: 1 },
      },
    })
    expect(receipt.records.map((record) => record.path)).toEqual([
      "packages/core/src/old.ts",
      "PROJECT.md",
      "tests/new.test.ts",
    ])
  })
})
