import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function functionSlice(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`)
  const next = source.indexOf("\nfunction ", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

describe("release package script env snapshot", () => {
  it("keeps command execution and pipeline filtering free of direct env reads", () => {
    const source = readFileSync(new URL("../scripts/release-package.mjs", import.meta.url), "utf-8")

    expect(source).toContain("const RELEASE_PACKAGE_ENV")
    expect(functionSlice(source, "runCommand")).not.toContain("process.env")
    expect(functionSlice(source, "filterPipelineSteps")).not.toContain("process.env")
  })
})
