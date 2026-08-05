import { describe, expect, it } from "vitest"

import {
  createWorktreeBaseline,
  parseGitPorcelainV1Z,
} from "../scripts/self/audit-worktree-baseline.mjs"

describe("task001 worktree baseline CLI boundary", () => {
  it("parses NUL-delimited porcelain records including spaces and renames", () => {
    const input = Buffer.from(
      " M docs/file with spaces.md\0R  packages/core/src/new.ts\0packages/core/src/old.ts\0?? tests/new.test.ts\0",
      "utf8",
    )

    expect(parseGitPorcelainV1Z(input)).toEqual([
      { status: " M", path: "docs/file with spaces.md" },
      {
        status: "R ",
        path: "packages/core/src/new.ts",
        originalPath: "packages/core/src/old.ts",
      },
      { status: "??", path: "tests/new.test.ts" },
    ])
  })

  it("reads Git only through an injected argument-based adapter", () => {
    const calls: Array<{ cwd: string; args: string[] }> = []
    const result = createWorktreeBaseline({
      repositoryRoot: "/workspace/knowbee",
      capturedAt: "2026-07-16T01:00:00Z",
      runGit({ cwd, args }) {
        calls.push({ cwd, args })
        if (args[0] === "rev-parse") return Buffer.from("abc123\n")
        if (args[0] === "show") return Buffer.from("2026-07-16T00:00:00Z\n")
        return Buffer.from(" M PROJECT.md\0?? tests/new.test.ts\0")
      },
    })

    expect(calls).toEqual([
      { cwd: "/workspace/knowbee", args: ["rev-parse", "HEAD"] },
      { cwd: "/workspace/knowbee", args: ["show", "-s", "--format=%cI", "HEAD"] },
      {
        cwd: "/workspace/knowbee",
        args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      },
    ])
    expect(result.counts).toMatchObject({ total: 2, tracked: 1, untracked: 1 })
  })

  it("rejects incomplete Git metadata instead of emitting a partial receipt", () => {
    expect(() =>
      createWorktreeBaseline({
        repositoryRoot: "/workspace/knowbee",
        capturedAt: "2026-07-16T01:00:00Z",
        runGit({ args }) {
          if (args[0] === "rev-parse") return Buffer.from("\n")
          return Buffer.from("")
        },
      }),
    ).toThrow("git HEAD SHA is missing")
  })
})
