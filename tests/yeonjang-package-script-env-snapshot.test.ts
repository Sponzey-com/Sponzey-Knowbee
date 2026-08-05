import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function functionSlice(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`)
  const next = source.indexOf("\nfunction ", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

describe("Yeonjang package script env snapshot", () => {
  it("keeps candidate path helpers free of direct env reads", () => {
    const source = readFileSync(
      new URL("../scripts/package-yeonjang-platform.mjs", import.meta.url),
      "utf-8",
    )

    expect(source).toContain("const YEONJANG_PACKAGE_ENV")
    expect(functionSlice(source, "defaultTargetDirs")).not.toContain("process.env")
    expect(functionSlice(source, "binaryCandidates")).not.toContain("process.env")
  })
})
